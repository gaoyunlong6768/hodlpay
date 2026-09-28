import { adminProgram, collectOverdue, postPrices } from "@/lib/server/admin";
import { fetchAssets } from "@/lib/hodlpay";
import { errorResponse } from "@/lib/server/http";

const REFRESH_AFTER_S = 45;

export const maxDuration = 60;

/** Scheduled keeper sweep (vercel.json daily, .github/workflows/keeper.yml hourly): collects every overdue installment across all positions. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const assets = await fetchAssets(adminProgram().program);
    const oldest = Math.min(...Object.values(assets).map((a) => a.updatedAt));
    const posted = Date.now() / 1000 - oldest > REFRESH_AFTER_S ? await postPrices() : null;
    return Response.json({ posted, collections: await collectOverdue() });
  } catch (e) {
    return errorResponse(e);
  }
}
