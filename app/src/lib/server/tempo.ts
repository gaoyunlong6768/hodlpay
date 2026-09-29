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
  toBytes,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { utils } from "@anchor-lang/core";
import { Connection, PublicKey, type ParsedTransactionWithMeta, type PartiallyDecodedInstruction } from "@solana/web3.js";
import { tempoModerato } from "viem/chains";
import {
  DEPLOYMENT,
  MEMO_PROGRAM_ID,
  PROGRAM_ID,
  TEMPO_MEMO_PREFIX,
  USDC_MINT,
  ata,
  connection,
  readonlyProgram,
} from "@/lib/hodlpay";
import tempo from "@/lib/hodlpay/tempo.json";

const STATE_DIR = process.env.HODLPAY_STATE_DIR ?? path.join(process.cwd(), ".hodlpay");

function stateFile<T>(name: string, what: string): T {
  const f = path.join(/*turbopackIgnore: true*/ STATE_DIR, name);
  if (!existsSync(/*turbopackIgnore: true*/ f)) throw new Error(`${what} missing: run scripts/tempo-deploy.ts`);
  return JSON.parse(readFileSync(/*turbopackIgnore: true*/ f, "utf8"));
}

function relayerKey(): Hex {
  if (process.env.TEMPO_PRIVATE_KEY) return process.env.TEMPO_PRIVATE_KEY as Hex;
  return stateFile<{ privateKey: Hex }>("tempo-key.json", "Tempo relayer key (or TEMPO_PRIVATE_KEY)").privateKey;
}

function attesterKeys(): Hex[] {
  if (process.env.TEMPO_ATTESTER_KEYS) return JSON.parse(process.env.TEMPO_ATTESTER_KEYS);
  return stateFile<Hex[]>("tempo-attesters.json", "Tempo attester keys (or TEMPO_ATTESTER_KEYS)");
}

/** Each attester reads Solana through its own endpoint, so one lying RPC cannot get a fake checkout signed. */
function attesterRpcs(): string[] {
  const primary = process.env.SOLANA_RPC || DEPLOYMENT.rpc;
  return [primary, DEPLOYMENT.rpc, process.env.TEMPO_ATTESTER_RPC_3 || primary];
}

const CHECKOUT_LOAN = 3;
const CHECKOUT_MERCHANT = 4;

async function confirmedTx(sig: string, conn: Connection): Promise<ParsedTransactionWithMeta> {
  for (let attempt = 0; ; attempt++) {
    const tx = await conn.getParsedTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (tx) return tx;
    if (attempt >= 5) throw new Error("Solana checkout not found");
    await new Promise((r) => setTimeout(r, 1500));
  }
}

interface Receipt {
  /** Merchant payout in token base units (6 decimals), as recorded by the loan. */
  units: bigint;
  merchant: Hex;
}

/**
 * Reads a confirmed HodlPay checkout: exactly one `checkout` instruction paying
 * the Tempo bridge, the amount the resulting loan recorded as paid out, and the
 * merchant payout address committed in its memo. Nothing is taken from the caller.
 */
async function bridgeReceipt(sig: string, conn: Connection = connection()): Promise<Receipt> {
  if (!DEPLOYMENT.tempoBridge) throw new Error("tempoBridge not configured in deployment.json");
  const tx = await confirmedTx(sig, conn);
  if (tx.meta?.err) throw new Error("Solana checkout failed");
  const p = readonlyProgram(conn);
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
  return { units: BigInt(loan.merchantReceived.toString()), merchant: getAddress(merchant.toLowerCase()) };
}

const checkoutRefOf = (sig: string) => keccak256(toBytes(sig));

const SETTLE_TYPES = {
  Settle: [
    { name: "checkoutRef", type: "bytes32" },
    { name: "merchant", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const;

interface Attestation {
  signer: Hex;
  signature: Hex;
  receipt: Receipt;
}

/** One attester: independently verifies the Solana checkout, then signs the payout it justifies. */
async function attest(key: Hex, rpc: string, sig: string): Promise<Attestation> {
  const receipt = await bridgeReceipt(sig, new Connection(rpc, "confirmed"));
  const account = privateKeyToAccount(key);
  const signature = await account.signTypedData({
    domain: { name: "HodlPaySettlement", version: "2", chainId: tempo.chainId, verifyingContract: tempo.settlement as Hex },
    types: SETTLE_TYPES,
    primaryType: "Settle",
    message: { checkoutRef: checkoutRefOf(sig), merchant: receipt.merchant, token: tempo.token as Hex, amount: receipt.units },
  });
  return { signer: account.address, signature, receipt };
}

const SETTLED = parseAbiItem(
  "event Settled(bytes32 indexed checkoutRef, address indexed merchant, address indexed token, uint256 amount)",
);
const LOG_SPAN = BigInt(100_000);

const CONTRACTS: { address: Hex; deployBlock: number; version: number }[] = [
  { address: tempo.settlement as Hex, deployBlock: tempo.deployBlock, version: tempo.version ?? 1 },
  ...(tempo.legacy ?? []).map((l) => ({ address: l.settlement as Hex, deployBlock: l.deployBlock, version: 1 })),
];

const tempoClient = () => createPublicClient({ chain: tempoModerato, transport: http(tempo.rpc) });

export interface TempoSettlement {
  hash: Hex;
  block: number;
  checkoutRef: Hex;
  merchant: Hex;
  amount: number;
  at: number;
  contract: Hex;
}

/** Settlements paid by every HodlPay settlement contract matching the indexed filter, newest first. */
async function settlements(args: { merchant?: Hex; checkoutRef?: Hex }): Promise<TempoSettlement[]> {
  const pub = tempoClient();
  const latest = await pub.getBlockNumber();
  const queries: Promise<{ contract: Hex; logs: Awaited<ReturnType<typeof pub.getLogs<typeof SETTLED>>> }>[] = [];
  for (const c of CONTRACTS) {
    for (let from = BigInt(c.deployBlock ?? 0); from <= latest; from += LOG_SPAN) {
      const to = from + LOG_SPAN - BigInt(1);
      queries.push(
        pub
          .getLogs({ address: c.address, event: SETTLED, args, fromBlock: from, toBlock: to < latest ? to : latest })
          .then((logs) => ({ contract: c.address, logs })),
      );
    }
  }
  const found = (await Promise.all(queries)).flatMap(({ contract, logs }) => logs.map((l) => ({ contract, l })));
  const blocks = new Map<bigint, number>();
  await Promise.all(
    [...new Set(found.map(({ l }) => l.blockNumber))].map(async (n) =>
      blocks.set(n, Number((await pub.getBlock({ blockNumber: n })).timestamp)),
    ),
  );
  return found
    .map(({ contract, l }) => ({
      hash: l.transactionHash,
      block: Number(l.blockNumber),
      checkoutRef: l.args.checkoutRef!,
      merchant: l.args.merchant!,
      amount: Number(formatUnits(l.args.amount!, 6)),
      at: blocks.get(l.blockNumber)! * 1000,
      contract,
    }))
    .sort((a, b) => b.block - a.block);
}

/** Every settlement paid to `merchant` by the HodlPay contracts, newest first. */
export const settlementsFor = (merchant: Hex) => settlements({ merchant });

export async function settleOnTempo(sig: string) {
  const receipt = await bridgeReceipt(sig);
  const checkoutRef = checkoutRefOf(sig);
  const amount = Number(formatUnits(receipt.units, 6));
  const base = { amount, token: tempo.tokenSymbol, merchant: receipt.merchant, checkoutRef };

  const [done] = await settlements({ checkoutRef });
  if (done) return { ...base, hash: done.hash, amount: done.amount };

  const keys = attesterKeys();
  const rpcs = attesterRpcs();
  const results = await Promise.allSettled(keys.map((k, i) => attest(k, rpcs[i % rpcs.length], sig)));
  const agreed = results
    .flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
    .filter((a) => a.receipt.units === receipt.units && a.receipt.merchant === receipt.merchant)
    .sort((a, b) => (BigInt(a.signer) < BigInt(b.signer) ? -1 : 1));
  if (agreed.length < tempo.threshold) {
    const why = results.flatMap((r) => (r.status === "rejected" ? [(r.reason as Error).message] : []));
    throw new Error(`Only ${agreed.length} of ${tempo.threshold} required attesters confirmed this checkout${why.length ? `: ${why[0]}` : ""}`);
  }

  const account = privateKeyToAccount(relayerKey());
  const transport = http(tempo.rpc);
  const pub = createPublicClient({ chain: tempoModerato, transport });
  const wallet = createWalletClient({ account, chain: tempoModerato, transport });
  const hash = await wallet.writeContract({
    address: tempo.settlement as Hex,
    abi: tempo.abi as Abi,
    functionName: "settle",
    args: [checkoutRef, receipt.merchant, tempo.token as Hex, receipt.units, agreed.map((a) => a.signature)],
  });
  const tx = await pub.waitForTransactionReceipt({ hash });
  if (tx.status !== "success") throw new Error(`Tempo settlement reverted (${hash})`);
  return { ...base, hash, attesters: agreed.map((a) => a.signer) };
}

export interface AuditRow extends TempoSettlement {
  solanaSig: string | null;
  /** `prelaunch`: paid by the legacy single-relayer contract for a local test-validator checkout. */
  status: "verified" | "mismatch" | "unbacked" | "prelaunch";
  detail: string;
}

const verified = new Map<Hex, AuditRow>();

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * Reconciles every Tempo payout against Solana without trusting the relayer or
 * the attesters: finds the checkout whose signature hashes to the payout's
 * `checkoutRef` among transactions touching the bridge's USDC account, then
 * re-reads the amount and merchant from that checkout.
 */
export async function auditTempo() {
  if (!DEPLOYMENT.tempoBridge) throw new Error("tempoBridge not configured in deployment.json");
  const conn = connection();
  const bridgeUsdc = ata(USDC_MINT, new PublicKey(DEPLOYMENT.tempoBridge));
  const [payouts, sigs] = await Promise.all([
    settlements({}),
    conn.getSignaturesForAddress(bridgeUsdc, { limit: 1000 }, "confirmed"),
  ]);
  const byRef = new Map(sigs.filter((s) => !s.err).map((s) => [checkoutRefOf(s.signature), s.signature]));

  const rows = await mapLimit(payouts, 3, async (s): Promise<AuditRow> => {
    const cached = verified.get(s.hash);
    if (cached) return cached;
    const solanaSig = byRef.get(s.checkoutRef) ?? null;
    if (!solanaSig) {
      const prelaunch = s.contract !== CONTRACTS[0].address && !!DEPLOYMENT.launchedAt && s.at < DEPLOYMENT.launchedAt * 1000;
      return prelaunch
        ? {
            ...s,
            solanaSig,
            status: "prelaunch",
            detail: `Legacy single-relayer payout for a local test-validator checkout, before the ${DEPLOYMENT.cluster} launch. The relayer alone could pay it; v2 attesters would refuse.`,
          }
        : { ...s, solanaSig, status: "unbacked", detail: `No Solana checkout to the bridge hashes to this checkoutRef` };
    }
    try {
      const r = await bridgeReceipt(solanaSig, conn);
      const amount = Number(formatUnits(r.units, 6));
      const ok = r.merchant === getAddress(s.merchant) && Math.abs(amount - s.amount) < 1e-9;
      const row: AuditRow = {
        ...s,
        solanaSig,
        status: ok ? "verified" : "mismatch",
        detail: ok ? "Amount and merchant match the Solana checkout" : `Solana checkout says ${amount} to ${r.merchant}`,
      };
      if (ok) verified.set(s.hash, row);
      return row;
    } catch (e) {
      return { ...s, solanaSig, status: "mismatch", detail: (e as Error).message };
    }
  });

  const pub = tempoClient();
  const current = CONTRACTS[0];
  const [paused, windowSpent, pool] = await Promise.all([
    pub.readContract({ address: current.address, abi: tempo.abi as Abi, functionName: "paused" }).catch(() => null),
    pub.readContract({ address: current.address, abi: tempo.abi as Abi, functionName: "windowSpent" }).catch(() => null),
    pub
      .readContract({
        address: tempo.token as Hex,
        abi: [parseAbiItem("function balanceOf(address) view returns (uint256)")],
        functionName: "balanceOf",
        args: [current.address],
      })
      .catch(() => null),
  ]);
  return {
    contract: {
      address: current.address,
      attesters: tempo.attesters ?? [],
      threshold: tempo.threshold ?? 1,
      maxPerSettlement: tempo.maxPerSettlement ?? null,
      dailyLimit: tempo.dailyLimit ?? null,
      paused: paused as boolean | null,
      windowSpent: windowSpent === null ? null : Number(formatUnits(windowSpent as bigint, 6)),
      pool: pool === null ? null : Number(formatUnits(pool as bigint, 6)),
    },
    legacy: CONTRACTS.slice(1).map((c) => c.address),
    summary: {
      payouts: rows.length,
      verified: rows.filter((r) => r.status === "verified").length,
      prelaunch: rows.filter((r) => r.status === "prelaunch").length,
      failed: rows.filter((r) => r.status === "unbacked" || r.status === "mismatch").length,
      volume: rows.reduce((t, r) => t + r.amount, 0),
    },
    rows,
  };
}
