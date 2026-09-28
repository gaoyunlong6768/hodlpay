import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseAbiItem,
  parseUnits,
  toBytes,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { TokenBalance } from "@solana/web3.js";
import { tempoModerato } from "viem/chains";
import { DEPLOYMENT, MEMO_PROGRAM_ID, PROGRAM_ID, TEMPO_MEMO_PREFIX, USDC_MINT, connection } from "@/lib/hodlpay";
import tempo from "@/lib/hodlpay/tempo.json";

function relayerKey(): Hex {
  if (process.env.TEMPO_PRIVATE_KEY) return process.env.TEMPO_PRIVATE_KEY as Hex;
  const f = path.join(process.env.HODLPAY_STATE_DIR ?? path.join(process.cwd(), ".hodlpay"), "tempo-key.json");
  if (!existsSync(/*turbopackIgnore: true*/ f)) throw new Error("Tempo relayer key missing: run scripts/tempo-deploy.ts or set TEMPO_PRIVATE_KEY");
  return JSON.parse(readFileSync(/*turbopackIgnore: true*/ f, "utf8")).privateKey;
}

/**
 * Reads a confirmed HodlPay checkout: the USDC the Tempo bridge received (from
 * token balance changes) and the merchant payout address committed in its memo.
 * Nothing about the payout is taken from the caller.
 */
async function bridgeReceipt(sig: string): Promise<{ amount: number; merchant: Hex }> {
  if (!DEPLOYMENT.tempoBridge) throw new Error("tempoBridge not configured in deployment.json");
  const tx = await connection().getParsedTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx || tx.meta?.err) throw new Error("Solana checkout not found or failed");
  const invokesHodlpay = tx.transaction.message.instructions.some((ix) => ix.programId.equals(PROGRAM_ID));
  if (!invokesHodlpay) throw new Error("Transaction is not a HodlPay checkout");
  const usdc = USDC_MINT.toBase58();
  const bal = (list: TokenBalance[] | null | undefined) =>
    (list ?? [])
      .filter((b) => b.mint === usdc && b.owner === DEPLOYMENT.tempoBridge)
      .reduce((s, b) => s + Number(b.uiTokenAmount.uiAmount ?? 0), 0);
  const received = bal(tx.meta?.postTokenBalances) - bal(tx.meta?.preTokenBalances);
  if (received <= 0) throw new Error("Checkout did not pay the Tempo bridge");

  const memo = tx.transaction.message.instructions
    .filter((ix) => ix.programId.equals(MEMO_PROGRAM_ID) && "parsed" in ix)
    .map((ix) => String((ix as { parsed: unknown }).parsed))
    .find((m) => m.startsWith(TEMPO_MEMO_PREFIX));
  const merchant = memo?.slice(TEMPO_MEMO_PREFIX.length);
  if (!merchant || !isAddress(merchant)) throw new Error("Checkout has no Tempo payout memo");
  return { amount: received, merchant: getAddress(merchant) };
}

const SETTLED = parseAbiItem(
  "event Settled(bytes32 indexed checkoutRef, address indexed merchant, address indexed token, uint256 amount)",
);
const LOG_SPAN = BigInt(100_000);

export interface TempoSettlement {
  hash: Hex;
  block: number;
  checkoutRef: Hex;
  amount: number;
  at: number;
}

/** Every settlement paid to `merchant` by the HodlPay contract, newest first. */
export async function settlementsFor(merchant: Hex): Promise<TempoSettlement[]> {
  const pub = createPublicClient({ chain: tempoModerato, transport: http(tempo.rpc) });
  const latest = await pub.getBlockNumber();
  const ranges: [bigint, bigint][] = [];
  for (let from = BigInt(tempo.deployBlock ?? 0); from <= latest; from += LOG_SPAN) {
    const to = from + LOG_SPAN - BigInt(1);
    ranges.push([from, to < latest ? to : latest]);
  }
  const chunks = await Promise.all(
    ranges.map(([fromBlock, toBlock]) =>
      pub.getLogs({ address: tempo.settlement as Hex, event: SETTLED, args: { merchant }, fromBlock, toBlock }),
    ),
  );
  const logs = chunks.flat();
  const blocks = new Map<bigint, number>();
  await Promise.all(
    [...new Set(logs.map((l) => l.blockNumber))].map(async (n) =>
      blocks.set(n, Number((await pub.getBlock({ blockNumber: n })).timestamp)),
    ),
  );
  return logs
    .map((l) => ({
      hash: l.transactionHash,
      block: Number(l.blockNumber),
      checkoutRef: l.args.checkoutRef!,
      amount: Number(formatUnits(l.args.amount!, 6)),
      at: blocks.get(l.blockNumber)! * 1000,
    }))
    .sort((a, b) => b.block - a.block);
}

export async function settleOnTempo(sig: string) {
  const { amount, merchant: to } = await bridgeReceipt(sig);

  const account = privateKeyToAccount(relayerKey());
  const transport = http(tempo.rpc);
  const pub = createPublicClient({ chain: tempoModerato, transport });
  const wallet = createWalletClient({ account, chain: tempoModerato, transport });
  const checkoutRef = keccak256(toBytes(sig));
  const abi = tempo.abi as Abi;

  if (await pub.readContract({ address: tempo.settlement as Hex, abi, functionName: "settled", args: [checkoutRef] })) {
    throw new Error("This checkout was already settled on Tempo");
  }
  const hash = await wallet.writeContract({
    address: tempo.settlement as Hex,
    abi,
    functionName: "settle",
    args: [checkoutRef, to, tempo.token as Hex, parseUnits(amount.toFixed(6), 6)],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Tempo settlement reverted (${hash})`);
  return { hash, amount, token: tempo.tokenSymbol, merchant: to, checkoutRef };
}
