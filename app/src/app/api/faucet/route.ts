import { PublicKey } from "@solana/web3.js";
import { FAUCET, faucet } from "@/lib/server/admin";

const COOLDOWN_MS = 60_000;
const recent = new Map<string, number>();

export async function POST(request: Request) {
  let wallet: PublicKey;
  try {
    wallet = new PublicKey((await request.json()).wallet);
  } catch {
    return Response.json({ error: "invalid wallet" }, { status: 400 });
  }
  const key = wallet.toBase58();
  if (Date.now() - (recent.get(key) ?? 0) < COOLDOWN_MS) {
    return Response.json({ error: "faucet cooldown, try again in a minute" }, { status: 429 });
  }
  try {
    const sig = await faucet(wallet);
    recent.set(key, Date.now());
    return Response.json({ sig, sent: FAUCET });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
