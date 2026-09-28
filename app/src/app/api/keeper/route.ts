import { adminProgram, collectOverdue, liquidatePosition, parseShock, postPrices, scanPositions } from "@/lib/server/admin";
import { PublicKey } from "@solana/web3.js";
import { fetchAssets } from "@/lib/hodlpay";
import { errorResponse, jsonBody } from "@/lib/server/http";

const REFRESH_AFTER_S = 45;

const isPubkey = (s: string) => {
  try {
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
};

/**
 * One keeper pass, callable from the web app so a demo deployment works
 * without a separate keeper process: refreshes stale oracle prices (at the
 * caller's stress-test `shock`, if any), collects `owner`'s installments that
 * are past their grace period from collateral, and, when `liquidate` is set,
 * liquidates `owner`'s position if it is past its liquidation threshold.
 * A pass never sweeps every liquidatable position, so one visitor's stress test
 * does not liquidate other demos. (On-chain, both stay permissionless.)
 */
export async function POST(request: Request) {
  const { force, liquidate, owner, shock } = await jsonBody(request);
  const s = parseShock(shock);
  if (s === null) return Response.json({ error: "shock must be between -0.7 and 0.3" }, { status: 400 });
  try {
    const { program } = adminProgram();
    const assets = await fetchAssets(program);
    const oldest = Math.min(...Object.values(assets).map((a) => a.updatedAt));
    const posted = force || Date.now() / 1000 - oldest > REFRESH_AFTER_S ? await postPrices(s) : null;

    const collections = typeof owner === "string" && isPubkey(owner) ? await collectOverdue(owner).catch(() => []) : [];

    const liquidations = [];
    const targets = liquidate && typeof owner === "string" ? await scanPositions(program) : [];
    for (const h of targets) {
      if (h.owner !== owner || h.status !== "liquidatable") continue;
      try {
        liquidations.push({ owner: h.owner, ...(await liquidatePosition(h)) });
      } catch (e) {
        liquidations.push({ owner: h.owner, error: (e as Error).message });
      }
    }
    return Response.json({ posted, collections, liquidations });
  } catch (e) {
    return errorResponse(e);
  }
}
