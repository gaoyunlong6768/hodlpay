/**
 * Sets up a HodlPay deployment on the target cluster:
 * test USDC + zenZEC mints, protocol config, collateral assets and liquidity.
 * Idempotent: safe to re-run.
 *
 *   HODLPAY_CLUSTER=localnet npx tsx scripts/bootstrap.ts
 *
 * Mainnet (docs/mainnet-runbook.md) uses the real mints, never mints, and
 * requires every money parameter to be set explicitly.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo, NATIVE_MINT } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import idl from "../src/lib/hodlpay/idl.json";

const CLUSTERS: Record<string, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
};
const cluster = process.env.HODLPAY_CLUSTER ?? "localnet";
const rpc = process.env.HODLPAY_RPC ?? CLUSTERS[cluster];
const DAY = 86_400;
const MAINNET = cluster === "mainnet";
const MAINNET_REQUIRED = ["HODLPAY_RPC", "USDC_MINT", "ZEC_MINT", "TREASURY", "MAX_LOAN_USDC", "MAX_TOTAL_DEBT_USDC", "RESERVE_USDC", "LIQUIDITY_USDC"];
if (MAINNET) {
  const missing = MAINNET_REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`mainnet bootstrap needs ${missing.join(", ")}`);
  process.env.SOLANA_RPC = process.env.HODLPAY_RPC;
  process.env.NEXT_PUBLIC_HODLPAY_CLUSTER = "mainnet";
}

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
  console.log(`cluster ${cluster} (${MAINNET ? CLUSTERS.mainnet : rpc}), admin ${admin.publicKey.toBase58()}`);
  if (MAINNET) {
    const need = Number(process.env.RESERVE_USDC) + Number(process.env.LIQUIDITY_USDC);
    const usdcAta = getAssociatedTokenAddressSync(new PublicKey(process.env.USDC_MINT!), admin.publicKey);
    const usdc = await conn.getTokenAccountBalance(usdcAta).then((b) => Number(b.value.uiAmount), () => 0);
    const sol = (await conn.getBalance(admin.publicKey)) / LAMPORTS_PER_SOL;
    console.log(`admin holds ${usdc} USDC (needs ${need}) and ${sol} SOL (needs 0.2)`);
    if (usdc < need || sol < 0.2) throw new Error("fund the admin wallet first");
  }

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

  const deploymentFile = path.join(process.cwd(), `src/lib/hodlpay/deployment${MAINNET ? ".mainnet" : ""}.json`);
  // Re-running on the same cluster keeps fields set later (public RPC, launch time, Tempo bridge).
  const existing = existsSync(deploymentFile) ? JSON.parse(readFileSync(deploymentFile, "utf8")) : {};
  const kept = existing.cluster === cluster ? existing : {};
  writeFileSync(
    deploymentFile,
    JSON.stringify(
      {
        cluster,
        // Committed and shipped to browsers: never the private (keyed) RPC on mainnet.
        rpc: process.env.NEXT_PUBLIC_RPC ?? kept.rpc ?? (MAINNET ? CLUSTERS.mainnet : rpc),
        programId: idl.address,
        usdcMint: usdcMint.toBase58(),
        zecMint: zecMint.toBase58(),
        solMint: NATIVE_MINT.toBase58(),
        // The Tempo rail runs on Tempo testnet only.
        ...(MAINNET ? {} : { tempoBridge: kept.tempoBridge ?? admin.publicKey.toBase58() }),
        ...(kept.launchedAt ? { launchedAt: kept.launchedAt } : {}),
      },
      null,
      2,
    ) + "\n",
  );

  const hp = await import("../src/lib/hodlpay");
  const { adminProgram, send } = await import("../src/lib/server/admin");
  const { getPrices } = await import("../src/lib/prices");
  const { program: p } = adminProgram();

  const merchantFeeBps = 150;
  if (!(await conn.getAccountInfo(hp.pdas.config()))) {
    await p.methods
      .initialize({
        merchantFeeBps,
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
  } else if ((await hp.fetchConfig(p)).merchantFeeBps !== merchantFeeBps) {
    await p.methods
      .setMerchantFee(merchantFeeBps)
      .accountsPartial({ admin: admin.publicKey, config: hp.pdas.config() })
      .rpc();
    console.log(`merchant fee set to ${merchantFeeBps / 100}%`);
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

  // Revenue split and beta limits. On mainnet set TREASURY to a multisig and the caps, e.g.
  // MAX_LOAN_USDC=500 MAX_TOTAL_DEBT_USDC=10000.
  const adminUsdc = await getOrCreateAssociatedTokenAccount(conn, admin, usdcMint, admin.publicKey);
  const protocolArgs = {
    treasury: new PublicKey(process.env.TREASURY ?? admin.publicKey.toBase58()),
    treasuryShareBps: Number(process.env.TREASURY_SHARE_BPS ?? 2_000),
    reserveShareBps: Number(process.env.RESERVE_SHARE_BPS ?? 1_000),
    maxLoan: hp.toUnits(Number(process.env.MAX_LOAN_USDC ?? 0), 6),
    maxTotalDebt: hp.toUnits(Number(process.env.MAX_TOTAL_DEBT_USDC ?? 0), 6),
  };
  const protocolAccounts = { admin: admin.publicKey, config: hp.pdas.config(), protocol: hp.pdas.protocol() };
  if (!(await conn.getAccountInfo(hp.pdas.protocol()))) {
    await p.methods.initProtocol(protocolArgs).accountsPartial(protocolAccounts).rpc();
    console.log("initialized protocol revenue split");
  } else {
    await p.methods.setProtocol(protocolArgs).accountsPartial(protocolAccounts).rpc();
  }
  console.log(
    `fees: ${protocolArgs.treasuryShareBps / 100}% treasury, ${protocolArgs.reserveShareBps / 100}% reserve; ` +
      `caps: loan ${process.env.MAX_LOAN_USDC ?? "none"}, total debt ${process.env.MAX_TOTAL_DEBT_USDC ?? "none"}`,
  );
  const reserveSeed = Number(process.env.RESERVE_USDC ?? 0);
  if (reserveSeed > 0 && (await p.account.protocol.fetch(hp.pdas.protocol())).reserveFunded.isZero()) {
    if (!process.env.USDC_MINT) await mintTo(conn, admin, usdcMint, adminUsdc.address, admin, BigInt(reserveSeed * 1e6));
    await p.methods
      .fundReserve(hp.toUnits(reserveSeed, 6))
      .accountsPartial({
        funder: admin.publicKey,
        config: hp.pdas.config(),
        protocol: hp.pdas.protocol(),
        liquidityVault: hp.pdas.liquidity(),
        funderUsdc: adminUsdc.address,
      })
      .rpc();
    console.log(`seeded the first-loss reserve with ${reserveSeed} USDC`);
  }

  const liquidity = Number(process.env.LIQUIDITY_USDC ?? 1_000_000);
  const vault = await conn.getTokenAccountBalance(hp.pdas.liquidity());
  if (Number(vault.value.uiAmount) < liquidity / 2) {
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
