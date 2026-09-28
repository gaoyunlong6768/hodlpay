import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Wallet } from "@anchor-lang/core";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, type VersionedTransaction } from "@solana/web3.js";
import {
  BN,
  DEPLOYMENT,
  MINTS,
  USDC_DECIMALS,
  USDC_MINT,
  ZEC_MINT,
  ata,
  buildLiquidate,
  connection,
  fetchAssets,
  fetchConfig,
  pdas,
  program,
  toUnits,
  tx,
  type CollateralId,
  type HodlpayProgram,
} from "@/lib/hodlpay";
import { getPrices } from "@/lib/prices";

const STATE_DIR = process.env.HODLPAY_STATE_DIR ?? path.join(process.cwd(), ".hodlpay");

export function loadAdmin(): Keypair {
  if (process.env.ADMIN_SECRET_KEY) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.ADMIN_SECRET_KEY)));
  }
  const file = process.env.ADMIN_KEYPAIR ?? path.join(homedir(), ".config/solana/id.json");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, "utf8"))));
}

export function keypairWallet(kp: Keypair): Wallet {
  const sign = <T extends Transaction | VersionedTransaction>(t: T): T => {
    if (t instanceof Transaction) t.partialSign(kp);
    else t.sign([kp]);
    return t;
  };
  return {
    payer: kp,
    publicKey: kp.publicKey,
    signTransaction: async (t) => sign(t),
    signAllTransactions: async (ts) => ts.map(sign),
  } as Wallet;
}

export function adminProgram() {
  const admin = loadAdmin();
  return { admin, program: program(keypairWallet(admin)) };
}

export async function send(p: HodlpayProgram, t: Transaction) {
  return p.provider.sendAndConfirm!(t, [], { commitment: "confirmed" });
}

export function getShock(): number {
  const f = path.join(STATE_DIR, "shock.json");
  if (!existsSync(f)) return 0;
  return Number(JSON.parse(readFileSync(f, "utf8")).shock) || 0;
}

export function setShock(shock: number) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(path.join(STATE_DIR, "shock.json"), JSON.stringify({ shock }));
}

/** Posts oracle prices (with the demo stress shock applied) to every collateral asset. */
export async function postPrices() {
  const { program: p, admin } = adminProgram();
  const quote = await getPrices();
  const shock = getShock();
  const ixs = await Promise.all(
    (Object.keys(MINTS) as CollateralId[]).map((id) =>
      p.methods
        .updatePrice(toUnits(quote.prices[id] * (1 + shock), 6))
        .accountsPartial({ keeper: admin.publicKey, config: pdas.config(), asset: pdas.asset(MINTS[id].mint) })
        .instruction(),
    ),
  );
  const sig = await send(p, tx(...ixs));
  return { sig, source: quote.source, shock, prices: quote.prices };
}

export const FAUCET = { usdc: 2_000, zec: 3, sol: 5 };

/** Sends demo funds: test USDC, test zenZEC and (on localnet) SOL. */
export async function faucet(wallet: PublicKey) {
  const { program: p, admin } = adminProgram();
  const conn = p.provider.connection;
  const usdcAta = ata(USDC_MINT, wallet);
  const zecAta = ata(ZEC_MINT, wallet);
  const t = tx(
    createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, usdcAta, wallet, USDC_MINT),
    createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, zecAta, wallet, ZEC_MINT),
    createMintToInstruction(USDC_MINT, usdcAta, admin.publicKey, BigInt(FAUCET.usdc * 10 ** USDC_DECIMALS)),
    createMintToInstruction(ZEC_MINT, zecAta, admin.publicKey, BigInt(FAUCET.zec * 10 ** MINTS.zenZEC.decimals)),
  );
  if (DEPLOYMENT.cluster === "localnet") {
    t.add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: wallet, lamports: FAUCET.sol * LAMPORTS_PER_SOL }));
  } else {
    const bal = await conn.getBalance(wallet);
    if (bal < 0.05 * LAMPORTS_PER_SOL) {
      t.add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: wallet, lamports: 0.1 * LAMPORTS_PER_SOL }));
    }
  }
  return send(p, t);
}

export interface Health {
  owner: string;
  debt: number;
  collateralValue: number;
  borrowLimit: number;
  marginLimit: number;
  liquidationLimit: number;
  status: "healthy" | "margin" | "liquidatable";
  largest: CollateralId | null;
  values: Record<CollateralId, number>;
}

export async function scanPositions(p: HodlpayProgram): Promise<Health[]> {
  const [assets, positions] = await Promise.all([fetchAssets(p), p.account.position.all()]);
  return positions.map(({ account }) => {
    const values: Record<CollateralId, number> = { SOL: 0, zenZEC: 0 };
    let borrowLimit = 0;
    let marginLimit = 0;
    let liquidationLimit = 0;
    account.mints.forEach((m, i) => {
      for (const id of Object.keys(MINTS) as CollateralId[]) {
        if (!m.equals(MINTS[id].mint)) continue;
        const v = (Number(account.amounts[i].toString()) / 10 ** MINTS[id].decimals) * assets[id].price;
        values[id] += v;
        borrowLimit += v * assets[id].maxLtv;
        marginLimit += v * assets[id].marginLtv;
        liquidationLimit += v * assets[id].liquidationLtv;
      }
    });
    const debt = Number(account.debt.toString()) / 10 ** USDC_DECIMALS;
    const collateralValue = values.SOL + values.zenZEC;
    const status = debt > liquidationLimit ? "liquidatable" : debt > marginLimit ? "margin" : "healthy";
    const largest =
      collateralValue === 0 ? null : ((Object.keys(values) as CollateralId[]).sort((a, b) => values[b] - values[a])[0] ?? null);
    return {
      owner: account.owner.toBase58(),
      debt,
      collateralValue,
      borrowLimit,
      marginLimit,
      liquidationLimit,
      status,
      largest,
      values,
    };
  });
}

/**
 * Liquidates one position as the keeper: repays the smaller of the close-factor
 * cap, the amount needed to restore max LTV, and what the largest slot can cover.
 */
export async function liquidatePosition(h: Health) {
  const { program: p, admin } = adminProgram();
  if (h.status !== "liquidatable" || !h.largest) throw new Error("Position is not liquidatable");
  const cfg = await fetchConfig(p);
  const b = cfg.liquidationBonusBps / 10_000;
  const mx = h.borrowLimit / h.collateralValue;
  const target = (h.debt - mx * h.collateralValue) / (1 - mx * (1 + b));
  const cap = (h.debt * cfg.closeFactorBps) / 10_000;
  const slotCap = h.values[h.largest] / (1 + b);
  const repay = Math.max(0, Math.min(target, cap, slotCap) * 0.999);

  const usdcAta = ata(USDC_MINT, admin.publicKey);
  const units = new BN(Math.floor(repay * 10 ** USDC_DECIMALS).toString());
  const t = tx(
    createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, usdcAta, admin.publicKey, USDC_MINT),
    createMintToInstruction(USDC_MINT, usdcAta, admin.publicKey, BigInt(units.toString())),
    ...(await buildLiquidate(p, admin.publicKey, new PublicKey(h.owner), h.largest, units)),
  );
  const sig = await send(p, t);
  return { sig, repaid: repay, asset: h.largest };
}

export { connection };
