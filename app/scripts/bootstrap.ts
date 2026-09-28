/**
 * Sets up a HodlPay deployment on the target cluster:
 * test USDC + zenZEC mints, protocol config, collateral assets and liquidity.
 * Idempotent: safe to re-run.
 *
 *   HODLPAY_CLUSTER=localnet npx tsx scripts/bootstrap.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, NATIVE_MINT } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import idl from "../src/lib/hodlpay/idl.json";

const CLUSTERS: Record<string, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
};
const cluster = process.env.HODLPAY_CLUSTER ?? "localnet";
const rpc = process.env.HODLPAY_RPC ?? CLUSTERS[cluster];
const DAY = 86_400;

const keysDir = path.join(process.cwd(), ".hodlpay", "keys");
mkdirSync(keysDir, { recursive: true });

function loadOrCreate(name: string): Keypair {
  const f = path.join(keysDir, `${cluster}-${name}.json`);
  if (existsSync(f)) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(f, "utf8"))));
  const kp = Keypair.generate();
  writeFileSync(f, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

async function main() {
  const admin = Keypair.fromSecretKey(
    Uint8Array.from(
      JSON.parse(readFileSync(process.env.ADMIN_KEYPAIR ?? path.join(homedir(), ".config/solana/id.json"), "utf8")),
    ),
  );
  const conn = new Connection(rpc, "confirmed");
  console.log(`cluster ${cluster} (${rpc}), admin ${admin.publicKey.toBase58()}`);

  // On mainnet, pass the real mints: USDC_MINT=EPjF…Dt1v ZEC_MINT=JDt9rRGaieF6aN1cJkXFeUmsy7ZE4yY3CZb8tVMXVroS
  const usdcKp = loadOrCreate("usdc-mint");
  const zecKp = loadOrCreate("zec-mint");
  const usdcMint = process.env.USDC_MINT ? new PublicKey(process.env.USDC_MINT) : usdcKp.publicKey;
  const zecMint = process.env.ZEC_MINT ? new PublicKey(process.env.ZEC_MINT) : zecKp.publicKey;
  for (const [kp, decimals, label, external] of [
    [usdcKp, 6, "USDC", !!process.env.USDC_MINT],
    [zecKp, 8, "zenZEC", !!process.env.ZEC_MINT],
  ] as const) {
    if (!external && !(await conn.getAccountInfo(kp.publicKey))) {
      await createMint(conn, admin, admin.publicKey, null, decimals, kp);
      console.log(`created test ${label} mint ${kp.publicKey.toBase58()}`);
    }
  }

  const deploymentFile = path.join(process.cwd(), "src/lib/hodlpay/deployment.json");
  writeFileSync(
    deploymentFile,
    JSON.stringify(
      {
        cluster,
        rpc: process.env.NEXT_PUBLIC_RPC ?? rpc,
        programId: idl.address,
        usdcMint: usdcMint.toBase58(),
        zecMint: zecMint.toBase58(),
        solMint: NATIVE_MINT.toBase58(),
        tempoBridge: admin.publicKey.toBase58(),
      },
      null,
      2,
    ) + "\n",
  );

  const hp = await import("../src/lib/hodlpay");
  const { adminProgram, send } = await import("../src/lib/server/admin");
  const { getPrices } = await import("../src/lib/prices");
  const { program: p } = adminProgram();

  if (!(await conn.getAccountInfo(hp.pdas.config()))) {
    await p.methods
      .initialize({
        merchantFeeBps: 300,
        liquidationBonusBps: 500,
        closeFactorBps: 5_000,
        installments: 4,
        installmentInterval: new hp.BN(14 * DAY),
        maxPriceAge: new hp.BN(Number(process.env.MAX_PRICE_AGE ?? 600)),
        lateFeeBps: 100,
        gracePeriod: new hp.BN(3 * DAY),
      })
      .accountsPartial({
        admin: admin.publicKey,
        config: hp.pdas.config(),
        usdcMint,
        liquidityVault: hp.pdas.liquidity(),
        lpMint: hp.pdas.lpMint(),
      })
      .rpc();
    console.log("initialized config");
  }

  const { prices } = await getPrices();
  const tiers: Record<string, [PublicKey, number, number, number, number]> = {
    SOL: [NATIVE_MINT, 5_000, 6_500, 7_500, prices.SOL],
    zenZEC: [zecMint, 4_000, 5_500, 6_500, prices.zenZEC],
  };
  for (const [label, [mint, max, margin, liq, price]] of Object.entries(tiers)) {
    if (await conn.getAccountInfo(hp.pdas.asset(mint))) continue;
    await p.methods
      .addAsset({
        maxLtvBps: max,
        marginLtvBps: margin,
        liquidationLtvBps: liq,
        priceE6: hp.toUnits(price, 6),
        pythFeedId: Array.from(Buffer.from(hp.PYTH_FEEDS[label as keyof typeof hp.PYTH_FEEDS], "hex")),
      })
      .accountsPartial({
        admin: admin.publicKey,
        config: hp.pdas.config(),
        mint,
        asset: hp.pdas.asset(mint),
        vault: hp.pdas.collateralVault(mint),
      })
      .rpc();
    console.log(`added collateral ${label} @ $${price}`);
  }

  const liquidity = Number(process.env.LIQUIDITY_USDC ?? 1_000_000);
  const vault = await conn.getTokenAccountBalance(hp.pdas.liquidity());
  if (Number(vault.value.uiAmount) < liquidity / 2) {
    const adminUsdc = await getOrCreateAssociatedTokenAccount(conn, admin, usdcMint, admin.publicKey);
    if (!process.env.USDC_MINT) await mintTo(conn, admin, usdcMint, adminUsdc.address, admin, BigInt(liquidity * 1e6));
    await send(p, hp.tx(...(await hp.buildLpDeposit(p, admin.publicKey, liquidity))));
    console.log(`deposited ${liquidity} USDC as the first liquidity provider`);
  }

  const bal = await conn.getTokenAccountBalance(hp.pdas.liquidity());
  console.log(`ready. liquidity vault: ${bal.value.uiAmountString} USDC`);
  console.log(`deployment written to ${path.relative(process.cwd(), deploymentFile)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
