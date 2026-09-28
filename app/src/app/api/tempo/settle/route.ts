import { settleOnTempo } from "@/lib/server/tempo";

/**
 * Relays a confirmed Solana checkout on the Tempo rail to a stablecoin payout
 * on Tempo. Amount and merchant are read from the Solana transaction itself.
 */
export async function POST(request: Request) {
  const { sig } = await request.json().catch(() => ({}));
  if (typeof sig !== "string") return Response.json({ error: "sig is required" }, { status: 400 });
  try {
    return Response.json(await settleOnTempo(sig));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
