import { PYTH_FEEDS } from "@/lib/hodlpay";

export type Prices = { SOL: number; zenZEC: number };
export type PriceQuote = { source: string; prices: Prices; at: number };

async function fromPyth(): Promise<Prices> {
  const key = process.env.PYTH_API_KEY;
  if (!key) throw new Error("no PYTH_API_KEY");
  const qs = Object.values(PYTH_FEEDS)
    .map((id) => `ids%5B%5D=${id}`)
    .join("&");
  const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${qs}&parsed=true`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`pyth ${res.status}`);
  const body = (await res.json()) as {
    parsed: { id: string; price: { price: string; expo: number } }[];
  };
  const px = (id: string) => {
    const p = body.parsed.find((f) => f.id === id);
    if (!p) throw new Error(`pyth missing ${id}`);
    return Number(p.price.price) * 10 ** p.price.expo;
  };
  return { SOL: px(PYTH_FEEDS.SOL), zenZEC: px(PYTH_FEEDS.zenZEC) };
}

async function fromCoinGecko(): Promise<Prices> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana,zcash&vs_currencies=usd",
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const b = (await res.json()) as { solana: { usd: number }; zcash: { usd: number } };
  return { SOL: b.solana.usd, zenZEC: b.zcash.usd };
}

async function fromOkx(): Promise<Prices> {
  const get = async (inst: string) => {
    const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${inst}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`okx ${res.status}`);
    const b = (await res.json()) as { data: { last: string }[] };
    return Number(b.data[0].last);
  };
  const [SOL, zenZEC] = await Promise.all([get("SOL-USDT"), get("ZEC-USDT")]);
  return { SOL, zenZEC };
}

let cache: PriceQuote | null = null;

/** Pyth when an API key is configured, then public market data. Cached for 10s. */
export async function getPrices(): Promise<PriceQuote> {
  if (cache && Date.now() - cache.at < 10_000) return cache;
  for (const [source, fn] of [
    ["pyth", fromPyth],
    ["coingecko", fromCoinGecko],
    ["okx", fromOkx],
  ] as const) {
    try {
      cache = { source, prices: await fn(), at: Date.now() };
      return cache;
    } catch {}
  }
  if (cache) return cache;
  throw new Error("all price sources failed");
}
