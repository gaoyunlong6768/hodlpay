import { PublicKey } from "@solana/web3.js";
import type { Rail } from "@/lib/engine";

/** A merchant's payment request, carried in a `/pay` link. */
export interface PayRequest {
  merchant: string;
  item: string;
  amount: number;
  rail: Rail;
  /** Solana payout wallet (Solana rail). */
  to?: string;
  /** Tempo payout address (Tempo rail). */
  tempo?: string;
  /** Merchant order reference, shown on the receipt. */
  ref?: string;
  /** Where the shopper goes after paying. */
  back?: string;
}

const MAX_AMOUNT = 100_000;
const isEvm = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);
const isSolana = (a: string) => {
  try {
    return new PublicKey(a).toBase58() === a;
  } catch {
    return false;
  }
};

export function payPath(r: PayRequest) {
  const q = new URLSearchParams({ merchant: r.merchant, item: r.item, amount: String(r.amount), rail: r.rail });
  if (r.rail === "solana" && r.to) q.set("to", r.to);
  if (r.rail === "tempo" && r.tempo) q.set("tempo", r.tempo);
  if (r.ref) q.set("ref", r.ref);
  if (r.back) q.set("back", r.back);
  return `/pay?${q.toString()}`;
}

export function parsePay(q: Record<string, string | string[] | undefined>): PayRequest | { error: string } {
  const get = (k: string) => {
    const v = q[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const amount = Number(get("amount"));
  const rail: Rail = get("rail") === "tempo" ? "tempo" : "solana";
  const r: PayRequest = {
    merchant: get("merchant").slice(0, 60) || "Merchant",
    item: get("item").slice(0, 80) || "Order",
    amount: Math.round(amount * 100) / 100,
    rail,
    to: get("to") || undefined,
    tempo: get("tempo") || undefined,
    ref: get("ref").slice(0, 40) || undefined,
    back: /^https?:\/\//.test(get("back")) ? get("back") : undefined,
  };
  if (!Number.isFinite(amount) || amount < 1 || amount > MAX_AMOUNT) {
    return { error: `Amount must be between $1 and $${MAX_AMOUNT.toLocaleString()}.` };
  }
  if (rail === "solana" && !(r.to && isSolana(r.to))) return { error: "This link has no valid Solana payout wallet." };
  if (rail === "tempo" && !(r.tempo && isEvm(r.tempo))) return { error: "This link has no valid Tempo payout address." };
  return r;
}

export { isEvm, isSolana };
