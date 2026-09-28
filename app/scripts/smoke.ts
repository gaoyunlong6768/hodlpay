/**
 * End-to-end smoke test against a live cluster (default: localnet):
 * faucet → deposit SOL + zenZEC → checkout → repay → price crash → keeper liquidation.
 *
 *   npx tsx scripts/smoke.ts
 *   SMOKE_SOL=0.01 npx tsx scripts/smoke.ts   # devnet: the faucet only funds 0.03 SOL
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import * as hp from "../src/lib/hodlpay";
import {
  faucet,
  keypairWallet,
  liquidatePosition,
  postPrices,
  scanPositions,
  send,
  setShock,
} from "../src/lib/server/admin";

const MERCHANT = new PublicKey(process.env.MERCHANT ?? "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");

async function main() {
  const user = Keypair.generate();
  const p = hp.program(keypairWallet(user));
  const conn = p.provider.connection;
  const step = async (label: string, ixs: Promise<import("@solana/web3.js").TransactionInstruction[]>) => {
    const sig = await send(p, hp.tx(...(await ixs)));
    console.log(`✓ ${label} ${sig.slice(0, 16)}…`);
  };

  setShock(0);
  await postPrices();
  console.log(`user ${user.publicKey.toBase58()}`);
  console.log(`✓ faucet ${(await faucet(user.publicKey)).slice(0, 16)}…`);

  const feed = hp.pythFeedAccount(hp.PYTH_FEEDS.SOL);
  const feedInfo = await conn.getAccountInfo(feed);
  if (feedInfo?.owner.equals(hp.PYTH_RECEIVER_ID)) {
    const u = hp.readPythUpdate(feedInfo.data);
    const age = Math.round(Date.now() / 1000 - u.publishTime);
    if (age < (await hp.fetchConfig(p)).maxPriceAge) {
      await step("permissionless Pyth refresh by a regular user (SOL)", Promise.all([hp.buildRefreshPrice(p, "SOL", feed)]));
      const a = await hp.fetchAssets(p);
      console.log(`  Pyth update $${(u.price * 10 ** u.exponent).toFixed(4)} (${age}s old), on-chain SOL price $${a.SOL.price}`);
    } else {
      console.log(`  skipped Pyth refresh: sponsored update is ${age}s old`);
    }
  }

  const pool0 = await hp.fetchPool(p);
  await step("LP deposit 1000 USDC", hp.buildLpDeposit(p, user.publicKey, 1000));
  const lpShares = Number((await conn.getTokenAccountBalance(hp.ata(hp.pdas.lpMint(), user.publicKey))).value.uiAmount);
  console.log(`  got ${lpShares.toFixed(4)} LP shares at $${pool0.sharePrice.toFixed(6)}`);

  const solDeposit = Number(process.env.SMOKE_SOL ?? 2);
  await step(`deposit ${solDeposit} SOL`, hp.buildDeposit(p, user.publicKey, "SOL", solDeposit, false));
  await step("deposit 1 zenZEC", hp.buildDeposit(p, user.publicKey, "zenZEC", 1, true));

  let pos = await hp.fetchPosition(p, user.publicKey);
  const assets = await hp.fetchAssets(p);
  const limit = pos.collateral.SOL * assets.SOL.price * 0.5 + pos.collateral.zenZEC * assets.zenZEC.price * 0.4;
  const amount = Math.floor(limit * 0.9);
  console.log(`  borrow limit ${limit.toFixed(2)} USDC, buying ${amount}`);

  await step(`checkout ${amount} USDC`, hp.buildCheckout(p, user.publicKey, MERCHANT, amount, pos.loanCount));
  const merchantBal = await conn.getTokenAccountBalance(hp.ata(hp.USDC_MINT, MERCHANT));
  console.log(`  merchant received ${merchantBal.value.uiAmountString} USDC`);

  await step("repay installment 1", hp.buildRepay(p, user.publicKey, 0));
  pos = await hp.fetchPosition(p, user.publicKey);
  console.log(`  debt now ${pos.debt} USDC`);

  if (process.env.SKIP_TEMPO !== "1") {
    const { settleOnTempo } = await import("../src/lib/server/tempo");
    const bridge = new PublicKey(hp.DEPLOYMENT.tempoBridge!);
    const tempoSig = await send(
      p,
      hp.tx(...(await hp.buildCheckout(p, user.publicKey, bridge, 50, 1)), hp.buildTempoMemo(hp.TEMPO.merchants.Bluebottle)),
    );
    const s = await settleOnTempo(tempoSig);
    console.log(`✓ tempo rail: ${s.amount} ${s.token} paid to ${s.merchant} on Tempo (${s.hash.slice(0, 18)}…)`);
    const replay = await settleOnTempo(tempoSig).then(
      () => "SETTLED TWICE",
      (e: Error) => e.message,
    );
    if (replay === "SETTLED TWICE") throw new Error("Tempo replay protection failed");
    console.log(`✓ tempo replay rejected: ${replay}`);
  }

  setShock(-0.6);
  await postPrices();
  const { program: admin } = (await import("../src/lib/server/admin")).adminProgram();
  const h = (await scanPositions(admin)).find((x) => x.owner === user.publicKey.toBase58())!;
  console.log(`  after -60% crash: status ${h.status}, debt ${h.debt.toFixed(2)} / liq limit ${h.liquidationLimit.toFixed(2)}`);
  const r = await liquidatePosition(h);
  console.log(`✓ keeper liquidated ${r.repaid.toFixed(2)} USDC against ${r.asset} ${r.sig.slice(0, 16)}…`);

  pos = await hp.fetchPosition(p, user.publicKey);
  console.log(`  after: debt ${pos.debt}, credit ${pos.creditBalance}, SOL ${pos.collateral.SOL}, ZEC ${pos.collateral.zenZEC}`);

  setShock(0);
  await postPrices();

  const pool1 = await hp.fetchPool(p);
  const usdcBefore = Number((await conn.getTokenAccountBalance(hp.ata(hp.USDC_MINT, user.publicKey))).value.uiAmount);
  await step("LP withdraw all shares", hp.buildLpWithdraw(p, user.publicKey, lpShares));
  const usdcAfter = Number((await conn.getTokenAccountBalance(hp.ata(hp.USDC_MINT, user.publicKey))).value.uiAmount);
  console.log(
    `  pool: $${pool1.feesEarned.toFixed(2)} fees earned, share price $${pool1.sharePrice.toFixed(6)}, utilization ${(pool1.utilization * 100).toFixed(2)}%`,
  );
  console.log(`  LP redeemed ${(usdcAfter - usdcBefore).toFixed(6)} USDC for 1000 deposited`);
  console.log("smoke test passed");
}

main().catch((e) => {
  setShock(0);
  console.error(e);
  process.exit(1);
});
