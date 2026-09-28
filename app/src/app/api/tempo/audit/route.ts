import { auditTempo } from "@/lib/server/tempo";
import { errorResponse } from "@/lib/server/http";

export const maxDuration = 60;

/** Public reconciliation of every Tempo payout against the Solana checkout that funded it. */
export async function GET() {
  try {
    return Response.json(await auditTempo(), { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch (e) {
    return errorResponse(e);
  }
}
