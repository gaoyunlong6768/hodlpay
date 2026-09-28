import { parseShock, postPrices } from "@/lib/server/admin";
import { errorResponse, jsonBody } from "@/lib/server/http";

/**
 * Demo stress test: shifts every oracle price by `shock` (e.g. -0.4 = -40%) and posts it on-chain.
 * The server keeps no shock state: the browser that set it re-sends it with its keeper passes
 * until it expires, so an abandoned stress test heals itself on the next keeper pass.
 */
export async function POST(request: Request) {
  const s = parseShock((await jsonBody(request)).shock);
  if (s === null) return Response.json({ error: "shock must be between -0.7 and 0.3" }, { status: 400 });
  try {
    return Response.json(await postPrices(s));
  } catch (e) {
    return errorResponse(e);
  }
}
