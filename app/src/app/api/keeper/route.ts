import { adminProgram, liquidatePosition, postPrices, scanPositions } from "@/lib/server/admin";
import { fetchAssets } from "@/lib/hodlpay";

const REFRESH_AFTER_S = 45;

/**
 * One keeper pass, callable from the web app so a demo deployment works
 * without a separate keeper process: refreshes stale oracle prices and, when
 * `liquidate` is set, liquidates every position past its liquidation threshold.
 */
export async function POST(request: Request) {
  const { force, liquidate } = await request.json().catch(() => ({}));
  try {
    const { program } = adminProgram();
    const assets = await fetchAssets(program);
    const oldest = Math.min(...Object.values(assets).map((a) => a.updatedAt));
    const posted = force || Date.now() / 1000 - oldest > REFRESH_AFTER_S ? await postPrices() : null;

    const liquidations = [];
    for (const h of liquidate ? await scanPositions(program) : []) {
      if (h.status !== "liquidatable") continue;
      try {
        liquidations.push({ owner: h.owner, ...(await liquidatePosition(h)) });
      } catch (e) {
        liquidations.push({ owner: h.owner, error: (e as Error).message });
      }
    }
    return Response.json({ posted, liquidations });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
