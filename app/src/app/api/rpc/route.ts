import { DEPLOYMENT } from "@/lib/hodlpay";
import { clientIp, errorResponse } from "@/lib/server/http";

/** Browser reads and sends go through the server's private RPC; the shared public devnet RPC rate-limits by IP. */
const ALLOWED = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getBalance",
  "getTokenAccountBalance",
  "getTokenSupply",
  "getGenesisHash",
  "getVersion",
  "getLatestBlockhash",
  "isBlockhashValid",
  "getBlockHeight",
  "getSlot",
  "getEpochInfo",
  "getSignatureStatuses",
  "getTransaction",
  "getFeeForMessage",
  "getMinimumBalanceForRentExemption",
  "getRecentPrioritizationFees",
  "simulateTransaction",
  "sendTransaction",
]);
/** The private RPC first; when it rate-limits or fails, the public endpoint (limited per server IP, not per visitor). */
const UPSTREAMS = [...new Set([process.env.SOLANA_RPC, DEPLOYMENT.rpc].filter((u): u is string => !!u))];
const WINDOW_MS = 60_000;
const IP_LIMIT = 600;
const MAX_BATCH = 20;
const byIp = new Map<string, number[]>();

type RpcCall = { method?: unknown; params?: unknown };

/** `getProgramAccounts` is allowed only against the HodlPay program. */
const permitted = (c: RpcCall) =>
  typeof c.method === "string" &&
  (ALLOWED.has(c.method) ||
    (c.method === "getProgramAccounts" && Array.isArray(c.params) && c.params[0] === DEPLOYMENT.programId));

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RpcCall | RpcCall[] | null;
  const calls = Array.isArray(body) ? body : body && typeof body === "object" ? [body] : [];
  if (!calls.length || calls.length > MAX_BATCH) return Response.json({ error: "invalid JSON-RPC request" }, { status: 400 });
  const denied = calls.find((c) => !permitted(c));
  if (denied) return Response.json({ error: `RPC method not available: ${String(denied.method)}` }, { status: 403 });

  const ip = clientIp(request);
  const now = Date.now();
  const hits = (byIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length + calls.length > IP_LIMIT) return Response.json({ error: "RPC rate limit, slow down" }, { status: 429 });
  byIp.set(ip, [...hits, ...calls.map(() => now)]);

  const forward = (url: string) =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    let res = await forward(UPSTREAMS[0]);
    if ((res.status === 429 || res.status >= 500) && UPSTREAMS[1]) res = await forward(UPSTREAMS[1]);
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  } catch (e) {
    return errorResponse(e, 502);
  }
}
