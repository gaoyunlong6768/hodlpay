import { adminProgram, collectOverdue, liquidatePosition, postPrices, scanPositions } from "@/lib/server/admin";
import { IS_MAINNET, fetchAssets } from "@/lib/hodlpay";
import { errorResponse } from "@/lib/server/http";

const REFRESH_AFTER_S = 45;

export const maxDuration = 60;

/**
 * Scheduled keeper sweep (vercel.json daily, .github/workflows/keeper.yml): collects every overdue
 * installment across all positions. On mainnet it also liquidates every position past its threshold;
 * the devnet demo leaves liquidation to the visitor who ran the stress test.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { program } = adminProgram();
    const assets = await fetchAssets(program);
    const oldest = Math.min(...Object.values(assets).map((a) => a.updatedAt));
    const posted = Date.now() / 1000 - oldest > REFRESH_AFTER_S ? await postPrices() : null;
    const liquidations = [];
    for (const h of IS_MAINNET ? await scanPositions(program) : []) {
      if (h.status !== "liquidatable") continue;
      try {
        liquidations.push({ owner: h.owner, ...(await liquidatePosition(h)) });
      } catch (e) {
        liquidations.push({ owner: h.owner, error: (e as Error).message });
      }
    }
    return Response.json({ posted, liquidations, collections: await collectOverdue() });
  } catch (e) {
    return errorResponse(e);
  }
}
