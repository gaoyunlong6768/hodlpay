import { NextResponse } from "next/server";

const PYTH_FEEDS = {
  SOL: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  zenZEC: "be9b59d178f0d6a97ab4c343bff2aa69caa1eaae3e9048a65788c529b125bb24",
} as const;

type Prices = { SOL: number; zenZEC: number };

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

export async function GET() {
  for (const [source, fn] of [
    ["pyth", fromPyth],
    ["coingecko", fromCoinGecko],
    ["okx", fromOkx],
  ] as const) {
    try {
      const prices = await fn();
      return NextResponse.json({ source, prices, at: Date.now() });
    } catch {}
  }
  return NextResponse.json({ error: "all price sources failed" }, { status: 502 });
}
