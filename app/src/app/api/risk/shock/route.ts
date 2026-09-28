import { parseShock, postPrices } from "@/lib/server/admin";

/**
 * Demo stress test: shifts every oracle price by `shock` (e.g. -0.4 = -40%) and posts it on-chain.
 * The server keeps no shock state: the browser that set it re-sends it with its keeper passes
 * until it expires, so an abandoned stress test heals itself on the next keeper pass.
 */
export async function POST(request: Request) {
  const { shock } = await request.json().catch(() => ({}));
  const s = parseShock(shock);
  if (s === null) return Response.json({ error: "shock must be between -0.9 and 1" }, { status: 400 });
  try {
    return Response.json(await postPrices(s));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
