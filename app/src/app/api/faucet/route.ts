import { PublicKey } from "@solana/web3.js";
import { FAUCET, faucet } from "@/lib/server/admin";
import { clientIp, errorResponse, jsonBody } from "@/lib/server/http";

const COOLDOWN_MS = 60_000;
const IP_WINDOW_MS = 60 * 60_000;
const IP_LIMIT = 10;
const recent = new Map<string, number>();
const byIp = new Map<string, number[]>();

export async function POST(request: Request) {
  let wallet: PublicKey;
  try {
    wallet = new PublicKey((await jsonBody(request)).wallet as string);
  } catch {
    return Response.json({ error: "invalid wallet" }, { status: 400 });
  }
  const key = wallet.toBase58();
  const now = Date.now();
  if (now - (recent.get(key) ?? 0) < COOLDOWN_MS) {
    return Response.json({ error: "faucet cooldown, try again in a minute" }, { status: 429 });
  }
  const ip = clientIp(request);
  const hits = (byIp.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_LIMIT) {
    return Response.json({ error: "Faucet limit reached for this network. Try again in an hour." }, { status: 429 });
  }
  recent.set(key, now);
  byIp.set(ip, [...hits, now]);
  try {
    return Response.json({ sig: await faucet(wallet), sent: FAUCET });
  } catch (e) {
    recent.delete(key);
    byIp.set(ip, hits);
    return errorResponse(e);
  }
}
