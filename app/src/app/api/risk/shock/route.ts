import { getShock, postPrices, setShock } from "@/lib/server/admin";

export async function GET() {
  return Response.json({ shock: getShock() });
}

/** Demo stress test: shifts every oracle price by `shock` (e.g. -0.4 = -40%) and posts it on-chain. */
export async function POST(request: Request) {
  const { shock } = await request.json().catch(() => ({}));
  const s = Number(shock);
  if (!Number.isFinite(s) || s < -0.9 || s > 1) {
    return Response.json({ error: "shock must be between -0.9 and 1" }, { status: 400 });
  }
  setShock(s);
  try {
    return Response.json(await postPrices());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
