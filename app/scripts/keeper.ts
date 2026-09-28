/**
 * HodlPay keeper: posts oracle prices, watches every position, sends margin
 * alerts, collects overdue installments from collateral and liquidates
 * unhealthy positions.
 *
 *   npx tsx scripts/keeper.ts            # loop
 *   npx tsx scripts/keeper.ts --once     # single pass
 *
 * Optional: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to push margin alerts.
 */
import { adminProgram, collectOverdue, liquidatePosition, postPrices, scanPositions, type Health } from "../src/lib/server/admin";
import { usd } from "../src/lib/engine";

const INTERVAL = Number(process.env.KEEPER_INTERVAL_MS ?? 15_000);
const lastStatus = new Map<string, Health["status"]>();

async function alert(text: string) {
  console.log(`  ! ${text}`);
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!token || !chat) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  }).catch(() => {});
}

async function tick() {
  const t = new Date().toISOString().slice(11, 19);
  const posted = await postPrices();
  const shock = posted.shock ? ` shock ${(posted.shock * 100).toFixed(0)}%` : "";
  console.log(
    `[${t}] prices SOL ${usd(posted.prices.SOL * (1 + posted.shock))} ZEC ${usd(posted.prices.zenZEC * (1 + posted.shock))} (${posted.source}${shock})`,
  );

  for (const c of await collectOverdue()) {
    const short = `${c.owner.slice(0, 4)}…${c.owner.slice(-4)}`;
    if (c.error) console.error(`  overdue collection failed for ${short} installment #${c.installment}: ${c.error}`);
    else await alert(`HodlPay collected overdue installment #${c.installment} for ${short} from ${c.asset} collateral: ${usd(c.paid!)} + ${usd(c.lateFee!)} late fee. tx ${c.sig}`);
  }

  const { program } = adminProgram();
  for (const h of await scanPositions(program)) {
    if (h.debt === 0) continue;
    const short = `${h.owner.slice(0, 4)}…${h.owner.slice(-4)}`;
    const ltv = h.collateralValue ? ((h.debt / h.collateralValue) * 100).toFixed(1) : "∞";
    if (h.status !== lastStatus.get(h.owner)) {
      if (h.status === "margin") {
        await alert(`HodlPay margin call for ${short}: LTV ${ltv}%. Add collateral or repay to avoid liquidation.`);
      } else if (h.status === "healthy" && lastStatus.get(h.owner)) {
        console.log(`  ${short} back to healthy (LTV ${ltv}%)`);
      }
      lastStatus.set(h.owner, h.status);
    }
    if (h.status === "liquidatable") {
      try {
        const r = await liquidatePosition(h);
        await alert(`HodlPay liquidated ${short}: repaid ${usd(r.repaid)} against ${r.asset} (LTV was ${ltv}%). tx ${r.sig}`);
      } catch (e) {
        console.error(`  liquidation failed for ${short}:`, (e as Error).message);
      }
    }
  }
}

async function main() {
  const once = process.argv.includes("--once");
  console.log(`HodlPay keeper ${once ? "(single pass)" : `every ${INTERVAL / 1000}s`}`);
  do {
    try {
      await tick();
    } catch (e) {
      console.error("tick failed:", (e as Error).message);
    }
    if (!once) await new Promise((r) => setTimeout(r, INTERVAL));
  } while (!once);
}

main();
