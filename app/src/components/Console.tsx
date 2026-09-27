"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ASSETS,
  PROTOCOL,
  advanceDays,
  checkout,
  deposit,
  initialState,
  liquidate,
  metrics,
  outstanding,
  repayNext,
  setPrice,
  usd,
  withdraw,
  type AssetId,
  type Loan,
  type Rail,
  type State,
} from "@/lib/engine";

const FALLBACK_PRICES: Record<AssetId, number> = { SOL: 120, zenZEC: 1500 };

const CATALOG = [
  { merchant: "Nomad Air", item: "SFO → Tokyo, one way", price: 860 },
  { merchant: "Kinfolk Studio", item: "Walnut desk", price: 1240 },
  { merchant: "Bluebottle", item: "Coffee subscription, 1 yr", price: 312 },
];

type PriceFeed = { source: string; prices: Record<AssetId, number>; at: number };

export default function Console() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <section id="console" className="min-h-screen" />;
  return <ConsoleInner />;
}

function ConsoleInner() {
  const [live, setLive] = useState<PriceFeed | null>(null);
  const [state, setState] = useState<State>(() => initialState(FALLBACK_PRICES));
  const [shock, setShock] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Loan | null>(null);

  const refreshPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/prices", { cache: "no-store" });
      if (!res.ok) return;
      setLive((await res.json()) as PriceFeed);
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshPrices();
    const t = setInterval(refreshPrices, 30_000);
    return () => clearInterval(t);
  }, [refreshPrices]);

  const base = live?.prices ?? FALLBACK_PRICES;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => {
      let n = s;
      for (const id of Object.keys(ASSETS) as AssetId[]) n = setPrice(n, id, base[id] * (1 + shock));
      return n;
    });
  }, [base, shock]);

  const m = useMemo(() => metrics(state), [state]);

  const run = (fn: (s: State) => State) => {
    try {
      setState(fn);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const act = (fn: (s: State) => State) => {
    try {
      const next = fn(state);
      setState(next);
      setError(null);
      return next;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  };

  return (
    <section id="console" className="mx-auto w-full max-w-6xl px-5 pb-24">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="num text-xs uppercase tracking-[0.2em] text-ink-soft">Live console</p>
          <h2 className="font-display text-4xl md:text-5xl">Your crypto, working at checkout.</h2>
        </div>
        <PriceTicker live={live} prices={state.prices} shock={shock} />
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between border border-vermilion/40 bg-vermilion/10 px-4 py-2 text-sm text-vermilion">
          <span>{error}</span>
          <button className="num text-xs underline" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Vault state={state} onDeposit={(a, x) => run((s) => deposit(s, a, x))} onWithdraw={(a, x) => run((s) => withdraw(s, a, x))} />
        </div>
        <div className="lg:col-span-4">
          <CreditLine m={m} />
        </div>
        <div className="lg:col-span-4">
          <Checkout
            available={m.available}
            onPay={(input) => {
              const next = act((s) => checkout(s, input));
              if (next) setReceipt(next.loans[0]);
            }}
            receipt={receipt}
          />
        </div>

        <div className="lg:col-span-8">
          <Installments
            state={state}
            onRepay={(id) => run((s) => repayNext(s, id))}
            onAdvance={() => run((s) => advanceDays(s, PROTOCOL.installmentIntervalDays))}
          />
        </div>
        <div className="lg:col-span-4">
          <RiskDesk
            shock={shock}
            setShock={setShock}
            status={m.status}
            onLiquidate={() => run(liquidate)}
          />
        </div>

        <div className="lg:col-span-12">
          <Ledger state={state} />
        </div>
      </div>
    </section>
  );
}

function Card({
  title,
  kicker,
  children,
  className = "",
}: {
  title: string;
  kicker: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`receipt h-full p-5 ${className}`}>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-display text-2xl">{title}</h3>
        <span className="num text-[10px] uppercase tracking-[0.2em] text-ink-soft">{kicker}</span>
      </div>
      {children}
    </div>
  );
}

function PriceTicker({
  live,
  prices,
  shock,
}: {
  live: PriceFeed | null;
  prices: Record<AssetId, number>;
  shock: number;
}) {
  return (
    <div className="num flex items-center gap-4 border border-rule bg-paper-2/60 px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-mint" : "bg-amber"}`} />
        {live ? `oracle: ${live.source}` : "oracle: offline (demo prices)"}
      </span>
      <span>SOL {usd(prices.SOL)}</span>
      <span>ZEC {usd(prices.zenZEC)}</span>
      {shock !== 0 && (
        <span className={shock < 0 ? "text-vermilion" : "text-mint"}>
          shock {(shock * 100).toFixed(0)}%
        </span>
      )}
    </div>
  );
}

function Vault({
  state,
  onDeposit,
  onWithdraw,
}: {
  state: State;
  onDeposit: (a: AssetId, x: number) => void;
  onWithdraw: (a: AssetId, x: number) => void;
}) {
  const [asset, setAsset] = useState<AssetId>("SOL");
  const [amount, setAmount] = useState("25");
  const x = Number(amount);

  return (
    <Card title="Vault" kicker="01 · collateral">
      <div className="space-y-2">
        {(Object.keys(ASSETS) as AssetId[]).map((id) => {
          const a = ASSETS[id];
          const locked = state.collateral[id];
          return (
            <button
              key={id}
              onClick={() => setAsset(id)}
              className={`flex w-full items-center justify-between border px-3 py-2.5 text-left transition ${
                asset === id ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink"
              }`}
            >
              <span>
                <span className="block font-medium">{id}</span>
                <span className="num block text-[11px] opacity-70">
                  {a.chain} · max LTV {(a.maxLtv * 100).toFixed(0)}%
                </span>
              </span>
              <span className="num text-right text-sm">
                <span className="block">{locked.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
                <span className="block text-[11px] opacity-70">{usd(locked * state.prices[id])}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="dash my-4" />
      <label className="num mb-1 block text-[11px] uppercase tracking-widest text-ink-soft">
        Amount ({asset})
      </label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        className="num w-full border border-rule bg-transparent px-3 py-2 text-lg outline-none focus:border-ink"
      />
      <p className="num mt-1 text-[11px] text-ink-soft">
        ≈ {usd((Number.isFinite(x) ? x : 0) * state.prices[asset])} · adds{" "}
        {usd((Number.isFinite(x) ? x : 0) * state.prices[asset] * ASSETS[asset].maxLtv)} credit
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => onDeposit(asset, x)}
          className="bg-ink px-3 py-2.5 text-sm font-medium text-paper transition hover:bg-mint"
        >
          Lock collateral
        </button>
        <button
          onClick={() => onWithdraw(asset, x)}
          className="border border-ink px-3 py-2.5 text-sm font-medium transition hover:bg-paper-2"
        >
          Unlock
        </button>
      </div>
    </Card>
  );
}

function CreditLine({ m }: { m: ReturnType<typeof metrics> }) {
  const tone =
    m.status === "liquidatable"
      ? "text-vermilion"
      : m.status === "margin"
        ? "text-amber"
        : "text-mint";
  const label = {
    empty: "No collateral yet",
    healthy: "Healthy",
    margin: "Margin alert",
    liquidatable: "Liquidatable",
  }[m.status];

  const scale = 0.9;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const maxL = m.collateralValue ? m.borrowLimit / m.collateralValue : 0;
  const marL = m.collateralValue ? m.marginLimit / m.collateralValue : 0;
  const liqL = m.collateralValue ? m.liquidationLimit / m.collateralValue : 0;

  return (
    <Card title="Credit line" kicker="02 · risk engine">
      <p className="num text-[11px] uppercase tracking-widest text-ink-soft">Available to spend</p>
      <p className="font-display text-6xl leading-none">{usd(m.available)}</p>
      <p className="num mt-2 text-xs text-ink-soft">
        of {usd(m.borrowLimit)} limit · {usd(m.debt)} owed
      </p>

      <div className="mt-6">
        <div className="mb-1 flex justify-between text-xs">
          <span className="num text-ink-soft">LTV {(m.ltv * 100).toFixed(1)}%</span>
          <span className={`num font-medium ${tone}`}>
            <span className={`mr-1.5 inline-block h-2 w-2 rounded-full bg-current ${m.status === "liquidatable" ? "alarm" : ""}`} />
            {label}
          </span>
        </div>
        <div className="relative h-3 border border-ink/80 bg-paper-2">
          <div
            className={`absolute inset-y-0 left-0 transition-all duration-500 ${
              m.status === "liquidatable" ? "bg-vermilion" : m.status === "margin" ? "bg-amber" : "bg-ink"
            }`}
            style={{ width: pct(m.ltv) }}
          />
          {m.collateralValue > 0 &&
            [
              [maxL, "max"],
              [marL, "margin"],
              [liqL, "liq"],
            ].map(([v, k]) => (
              <div key={k as string} className="absolute -top-1 -bottom-1 w-px bg-ink" style={{ left: pct(v as number) }}>
                <span className="num absolute top-4 -translate-x-1/2 text-[9px] uppercase text-ink-soft">{k}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="dash mt-9 pt-3">
        <Row k="Collateral value" v={usd(m.collateralValue)} />
        <Row k="Margin alert at" v={usd(m.marginLimit)} />
        <Row k="Liquidation at" v={usd(m.liquidationLimit)} />
        <Row
          k="Price drop to liquidation"
          v={m.debt > 0 ? `${(m.dropToLiquidation * 100).toFixed(1)}%` : "—"}
          strong
        />
      </div>
    </Card>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-ink-soft">{k}</span>
      <span className={`num ${strong ? "font-medium" : ""}`}>{v}</span>
    </div>
  );
}

function Checkout({
  available,
  onPay,
  receipt,
}: {
  available: number;
  onPay: (i: { merchant: string; item: string; price: number; rail: Rail }) => void;
  receipt: Loan | null;
}) {
  const [pick, setPick] = useState(0);
  const [rail, setRail] = useState<Rail>("solana");
  const c = CATALOG[pick];
  const fee = (c.price * PROTOCOL.merchantFeeBps) / 10_000;

  return (
    <Card title="Checkout" kicker="03 · merchant">
      <div className="space-y-1.5">
        {CATALOG.map((it, i) => (
          <button
            key={it.item}
            onClick={() => setPick(i)}
            className={`flex w-full items-center justify-between border px-3 py-2 text-left text-sm transition ${
              pick === i ? "border-ink" : "border-transparent hover:border-rule"
            }`}
          >
            <span>
              <span className="block font-medium">{it.item}</span>
              <span className="block text-[11px] text-ink-soft">{it.merchant}</span>
            </span>
            <span className="num">{usd(it.price)}</span>
          </button>
        ))}
      </div>

      <p className="num mt-4 mb-1 text-[11px] uppercase tracking-widest text-ink-soft">Merchant settles on</p>
      <div className="grid grid-cols-2 border border-ink text-sm">
        <button
          onClick={() => setRail("solana")}
          className={`py-2 transition ${rail === "solana" ? "bg-ink text-paper" : ""}`}
        >
          Solana · USDC
        </button>
        <button
          onClick={() => setRail("tempo")}
          className={`py-2 transition ${rail === "tempo" ? "bg-tempo text-paper" : ""}`}
        >
          Tempo · stablecoin
        </button>
      </div>

      <button
        onClick={() => onPay({ ...c, rail })}
        disabled={c.price > available}
        className="mt-3 w-full bg-ink px-3 py-3 text-sm font-medium text-paper transition hover:bg-mint disabled:cursor-not-allowed disabled:bg-ink/30"
      >
        {c.price > available ? `Need ${usd(c.price - available)} more credit` : `Pay 4 × ${usd(c.price / 4)} with HodlPay`}
      </button>
      <p className="num mt-1.5 text-[11px] text-ink-soft">
        Merchant gets {usd(c.price - fee)} now · fee {PROTOCOL.merchantFeeBps / 100}% · you pay 0% interest
      </p>

      {receipt && <Receipt loan={receipt} />}
    </Card>
  );
}

function Receipt({ loan }: { loan: Loan }) {
  return (
    <div key={loan.id} className="print receipt-edge mt-4 bg-paper-2 px-4 pb-3 pt-4 text-xs">
      <p className="num text-center uppercase tracking-[0.3em]">Paid · {loan.rail === "solana" ? "Solana" : "Tempo"}</p>
      <div className="dash my-2" />
      <Row k={loan.merchant} v={usd(loan.merchantReceived)} />
      <Row k="Collateral sold" v="0" />
      <Row k="Taxable event" v="none" />
      <div className="dash my-2" />
      {loan.installments.map((i) => (
        <div key={i.index} className="num flex justify-between">
          <span>
            #{i.index + 1} · {new Date(i.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          <span>{usd(i.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function Installments({
  state,
  onRepay,
  onAdvance,
}: {
  state: State;
  onRepay: (id: string) => void;
  onAdvance: () => void;
}) {
  return (
    <Card title="Installments" kicker="04 · repay">
      <div className="mb-3 flex items-center justify-between">
        <p className="num text-xs text-ink-soft">
          Today: {new Date(state.now).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
        <button onClick={onAdvance} className="num border border-ink px-2.5 py-1 text-xs transition hover:bg-paper-2">
          +{PROTOCOL.installmentIntervalDays} days →
        </button>
      </div>
      {state.loans.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-soft">No purchases yet. Lock collateral, then check out.</p>
      ) : (
        <div className="divide-y divide-dashed divide-rule">
          {state.loans.map((l) => {
            const left = outstanding(l);
            const next = l.installments.find((i) => i.paidAt === null);
            const overdue = next && next.dueAt < state.now - 1000;
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-4 py-3">
                <div className="min-w-44 flex-1">
                  <p className="font-medium">{l.item}</p>
                  <p className="num text-[11px] text-ink-soft">
                    {l.merchant} ·{" "}
                    <span className={l.rail === "tempo" ? "text-tempo" : ""}>{l.rail === "tempo" ? "Tempo" : "Solana"}</span>
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {l.installments.map((i) => (
                    <span
                      key={i.index}
                      title={usd(i.amount)}
                      className={`h-3 w-7 border ${
                        i.paidAt !== null
                          ? "border-mint bg-mint"
                          : next && i.index === next.index && overdue
                            ? "border-vermilion"
                            : "border-ink/60"
                      }`}
                    />
                  ))}
                </div>
                <div className="num w-28 text-right text-sm">
                  <span className="block">{usd(left)}</span>
                  <span className={`block text-[11px] ${overdue ? "text-vermilion" : "text-ink-soft"}`}>
                    {next
                      ? `${overdue ? "overdue" : "due"} ${new Date(next.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : "paid off"}
                  </span>
                </div>
                <button
                  disabled={!next}
                  onClick={() => onRepay(l.id)}
                  className="bg-ink px-3 py-2 text-xs font-medium text-paper transition hover:bg-mint disabled:bg-ink/20"
                >
                  {next ? `Repay ${usd(next.amount)}` : "Done"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function RiskDesk({
  shock,
  setShock,
  status,
  onLiquidate,
}: {
  shock: number;
  setShock: (n: number) => void;
  status: ReturnType<typeof metrics>["status"];
  onLiquidate: () => void;
}) {
  return (
    <Card title="Risk desk" kicker="05 · stress test" className={status === "liquidatable" ? "outline outline-2 outline-vermilion" : ""}>
      <p className="text-sm text-ink-soft">Simulate a market move on top of live oracle prices.</p>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="num text-[11px] uppercase tracking-widest text-ink-soft">Price shock</span>
        <span className={`num text-2xl ${shock < 0 ? "text-vermilion" : shock > 0 ? "text-mint" : ""}`}>
          {shock > 0 ? "+" : ""}
          {(shock * 100).toFixed(0)}%
        </span>
      </div>
      <input
        type="range"
        min={-70}
        max={30}
        step={1}
        value={Math.round(shock * 100)}
        onChange={(e) => setShock(Number(e.target.value) / 100)}
        className="mt-2 w-full"
      />
      <div className="num flex justify-between text-[10px] text-ink-soft">
        <span>-70%</span>
        <button className="underline" onClick={() => setShock(0)}>
          reset
        </button>
        <span>+30%</span>
      </div>
      <div className="dash my-4" />
      <p className="text-sm">
        {status === "liquidatable"
          ? "Debt is above the liquidation line. The keeper sells just enough collateral to restore max LTV."
          : status === "margin"
            ? "Margin alert sent. The user can top up or repay before any collateral is touched."
            : "No action needed. Keeper watches every oracle update."}
      </p>
      <button
        onClick={onLiquidate}
        disabled={status !== "liquidatable"}
        className="mt-3 w-full border border-vermilion px-3 py-2.5 text-sm font-medium text-vermilion transition hover:bg-vermilion hover:text-paper disabled:border-rule disabled:text-ink-soft disabled:hover:bg-transparent"
      >
        Run keeper: partial liquidation
      </button>
    </Card>
  );
}

function Ledger({ state }: { state: State }) {
  const color: Record<string, string> = {
    margin: "text-amber",
    liquidation: "text-vermilion",
    checkout: "text-mint",
    repay: "text-mint",
  };
  return (
    <Card title="Ledger" kicker="06 · events">
      {state.events.length === 0 ? (
        <p className="text-sm text-ink-soft">Every action is recorded here, as it would be on-chain.</p>
      ) : (
        <ul className="num max-h-64 space-y-1 overflow-auto text-xs">
          {state.events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-24 shrink-0 text-ink-soft">
                {new Date(e.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                {new Date(e.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </span>
              <span className={`w-20 shrink-0 uppercase ${color[e.kind] ?? ""}`}>{e.kind}</span>
              <span>{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
