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
import { utils } from "@anchor-lang/core";
import type { ParsedTransactionWithMeta, PartiallyDecodedInstruction } from "@solana/web3.js";
import { tempoModerato } from "viem/chains";
import {
  DEPLOYMENT,
  MEMO_PROGRAM_ID,
  PROGRAM_ID,
  TEMPO_MEMO_PREFIX,
  connection,
  fromUnits,
  readonlyProgram,
} from "@/lib/hodlpay";
import tempo from "@/lib/hodlpay/tempo.json";

function relayerKey(): Hex {
  if (process.env.TEMPO_PRIVATE_KEY) return process.env.TEMPO_PRIVATE_KEY as Hex;
  const f = path.join(process.env.HODLPAY_STATE_DIR ?? path.join(process.cwd(), ".hodlpay"), "tempo-key.json");
  if (!existsSync(/*turbopackIgnore: true*/ f)) throw new Error("Tempo relayer key missing: run scripts/tempo-deploy.ts or set TEMPO_PRIVATE_KEY");
  return JSON.parse(readFileSync(/*turbopackIgnore: true*/ f, "utf8")).privateKey;
}

const CHECKOUT_LOAN = 3;
const CHECKOUT_MERCHANT = 4;

async function confirmedTx(sig: string): Promise<ParsedTransactionWithMeta> {
  const conn = connection();
  for (let attempt = 0; ; attempt++) {
    const tx = await conn.getParsedTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (tx) return tx;
    if (attempt >= 5) throw new Error("Solana checkout not found");
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/**
 * Reads a confirmed HodlPay checkout: exactly one `checkout` instruction paying
 * the Tempo bridge, the amount the resulting loan recorded as paid out, and the
 * merchant payout address committed in its memo. Nothing is taken from the caller.
 */
async function bridgeReceipt(sig: string): Promise<{ amount: number; merchant: Hex }> {
  if (!DEPLOYMENT.tempoBridge) throw new Error("tempoBridge not configured in deployment.json");
  const tx = await confirmedTx(sig);
  if (tx.meta?.err) throw new Error("Solana checkout failed");
  const p = readonlyProgram();
  const disc = Buffer.from(p.idl.instructions.find((i) => i.name === "checkout")!.discriminator);
  const checkouts = tx.transaction.message.instructions.filter(
    (ix): ix is PartiallyDecodedInstruction =>
      ix.programId.equals(PROGRAM_ID) && "data" in ix && Buffer.from(utils.bytes.bs58.decode(ix.data)).subarray(0, 8).equals(disc),
  );
  if (checkouts.length !== 1) throw new Error("Transaction is not a single HodlPay checkout");
  const ix = checkouts[0];
  if (ix.accounts[CHECKOUT_MERCHANT]?.toBase58() !== DEPLOYMENT.tempoBridge) {
    throw new Error("Checkout did not pay the Tempo bridge");
  }
  const loan = await p.account.loan.fetch(ix.accounts[CHECKOUT_LOAN]);
  if (loan.merchant.toBase58() !== DEPLOYMENT.tempoBridge) throw new Error("Checkout did not pay the Tempo bridge");

  const memo = tx.transaction.message.instructions
    .filter((i) => i.programId.equals(MEMO_PROGRAM_ID) && "parsed" in i)
    .map((i) => String((i as { parsed: unknown }).parsed))
    .find((m) => m.startsWith(TEMPO_MEMO_PREFIX));
  const merchant = memo?.slice(TEMPO_MEMO_PREFIX.length);
  if (!merchant || !isAddress(merchant, { strict: false })) throw new Error("Checkout has no Tempo payout memo");
  return { amount: fromUnits(loan.merchantReceived, 6), merchant: getAddress(merchant.toLowerCase()) };
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

/** Settlements paid by the HodlPay contract matching the indexed filter, newest first. */
async function settlements(args: { merchant?: Hex; checkoutRef?: Hex }): Promise<TempoSettlement[]> {
  const pub = createPublicClient({ chain: tempoModerato, transport: http(tempo.rpc) });
  const latest = await pub.getBlockNumber();
  const ranges: [bigint, bigint][] = [];
  for (let from = BigInt(tempo.deployBlock ?? 0); from <= latest; from += LOG_SPAN) {
    const to = from + LOG_SPAN - BigInt(1);
    ranges.push([from, to < latest ? to : latest]);
  }
  const chunks = await Promise.all(
    ranges.map(([fromBlock, toBlock]) =>
      pub.getLogs({ address: tempo.settlement as Hex, event: SETTLED, args, fromBlock, toBlock }),
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

/** Every settlement paid to `merchant` by the HodlPay contract, newest first. */
export const settlementsFor = (merchant: Hex) => settlements({ merchant });

export async function settleOnTempo(sig: string) {
  const { amount, merchant: to } = await bridgeReceipt(sig);

  const account = privateKeyToAccount(relayerKey());
  const transport = http(tempo.rpc);
  const pub = createPublicClient({ chain: tempoModerato, transport });
  const wallet = createWalletClient({ account, chain: tempoModerato, transport });
  const checkoutRef = keccak256(toBytes(sig));
  const abi = tempo.abi as Abi;

  if (await pub.readContract({ address: tempo.settlement as Hex, abi, functionName: "settled", args: [checkoutRef] })) {
    const [done] = await settlements({ checkoutRef });
    if (!done) throw new Error("This checkout was already settled on Tempo");
    return { hash: done.hash, amount: done.amount, token: tempo.tokenSymbol, merchant: to, checkoutRef };
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
