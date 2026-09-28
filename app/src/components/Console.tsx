"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import WalletProviders from "@/components/WalletProviders";
import { DemoWalletName } from "@/lib/demoWallet";
import { DEPLOYMENT, explorerAddress, explorerTx, tempoExplorerTx } from "@/lib/hodlpay";
import { useOnchain, type Balances, type OnchainView } from "@/lib/useOnchain";
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
type Mode = "chain" | "sim";

export default function Console() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <section id="console" className="min-h-screen" />;
  return (
    <WalletProviders>
      <ConsoleInner />
    </WalletProviders>
  );
}

function ConsoleInner() {
  const [mode, setMode] = useState<Mode>("chain");
  return mode === "chain" ? <ChainConsole mode={mode} setMode={setMode} /> : <SimConsole mode={mode} setMode={setMode} />;
}

function ChainConsole({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const chain = useOnchain();
  const { view, busy, actions } = chain;
  const [shock, setShock] = useState(0);
  const [showReceipt, setShowReceipt] = useState(false);
  const empty = useMemo(() => initialState(FALLBACK_PRICES), []);
  const state = view?.state ?? empty;
  const m = useMemo(() => metrics(state, view?.debt ?? 0), [state, view?.debt]);

  useEffect(() => {
    fetch("/api/risk/shock")
      .then((r) => r.json())
      .then((b) => setShock(Number(b.shock) || 0))
      .catch(() => {});
  }, []);

  const connected = !!chain.owner;
  const guard = <A extends unknown[]>(fn: (...a: A) => unknown) => (...a: A) => {
    if (!connected) chain.setError("Connect a wallet first (the demo wallet works instantly).");
    else fn(...a);
  };

  return (
    <Shell
      mode={mode}
      setMode={setMode}
      ticker={
        <PriceTicker
          label={view ? `on-chain oracle · ${view.priceAge}s ago` : `${DEPLOYMENT.cluster} · connect to load`}
          ok={!!view && view.priceAge < 120}
          prices={state.prices}
          shock={shock}
        />
      }
      error={chain.error}
      clearError={() => chain.setError(null)}
    >
      <div className="lg:col-span-12">
        <WalletBar balances={view?.balances ?? null} busy={busy} onFaucet={actions.faucet} />
      </div>
      <div className="lg:col-span-4">
        <Vault
          state={state}
          balances={view?.balances}
          defaultAmount="2"
          busy={busy === "deposit" || busy === "withdraw"}
          onDeposit={guard(actions.deposit)}
          onWithdraw={guard(actions.withdraw)}
        />
      </div>
      <div className="lg:col-span-4">
        <CreditLine m={m} />
      </div>
      <div className="lg:col-span-4">
        <Checkout
          available={m.available}
          busy={busy === "checkout"}
          onPay={guard(async (input: Parameters<typeof actions.checkout>[0]) => {
            setShowReceipt(false);
            await actions.checkout(input);
            setShowReceipt(true);
          })}
          receipt={showReceipt ? (state.loans[0] ?? null) : null}
        />
      </div>
      <div className="lg:col-span-8">
        <Installments
          state={state}
          busy={busy === "repay"}
          creditBalance={view?.creditBalance ?? 0}
          onRepay={guard(actions.repay)}
        />
      </div>
      <div className="lg:col-span-4">
        <RiskDesk
          shock={shock}
          setShock={setShock}
          onCommit={(s) => actions.shock(s)}
          status={m.status}
          busy={busy === "shock" || busy === "liquidate"}
          onLiquidate={guard(actions.liquidate)}
          note="Moves the oracle price for every position on this demo deployment."
        />
      </div>
      <div className="lg:col-span-4">
        <Lend view={view} busy={busy === "lend"} onLend={guard(actions.lend)} onUnlend={guard(actions.unlend)} />
      </div>
      <div className="lg:col-span-8">
        <Ledger state={state} onchain />
      </div>
    </Shell>
  );
}

function Lend({
  view,
  busy,
  onLend,
  onUnlend,
}: {
  view: OnchainView | null;
  busy: boolean;
  onLend: (usd: number) => void;
  onUnlend: (usd: number) => void;
}) {
  const [amount, setAmount] = useState("500");
  const x = Number(amount);
  const pool = view?.pool;
  const mine = view ? view.lpShares * (pool?.sharePrice ?? 1) : 0;
  return (
    <Card title="Lend" kicker="07 · liquidity pool">
      <p className="text-sm text-ink-soft">
        LPs fund every purchase and earn the {PROTOCOL.merchantFeeBps / 100}% merchant fee
        {view ? ` plus a ${view.lateFeeBps / 100}% late fee after a ${view.gracePeriodDays}-day grace period` : ""}.
      </p>
      <div className="dash mt-3 pt-2">
        <Row k="Pool value" v={pool ? usd(pool.value) : "—"} />
        <Row k="Lent out" v={pool ? `${usd(pool.debt)} · ${(pool.utilization * 100).toFixed(2)}%` : "—"} />
        <Row k="Fees earned by LPs" v={pool ? usd(pool.feesEarned) : "—"} />
        <Row k="LP share price" v={pool ? `$${pool.sharePrice.toFixed(6)}` : "—"} strong />
        <Row k="Your position" v={view ? `${usd(mine)} · ${view.lpShares.toFixed(2)} shares` : "—"} />
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          aria-label="Lend amount in USDC"
          className="num w-full min-w-0 border border-rule bg-transparent px-3 py-2 outline-none focus:border-ink"
        />
        <button
          onClick={() => onLend(x)}
          disabled={busy}
          className="bg-ink px-3 py-2 text-sm font-medium text-paper transition hover:bg-mint disabled:bg-ink/40"
        >
          Supply
        </button>
        <button
          onClick={() => onUnlend(x)}
          disabled={busy || !view?.lpShares}
          className="border border-ink px-3 py-2 text-sm transition hover:bg-paper-2 disabled:opacity-40"
        >
          Redeem
        </button>
      </div>
    </Card>
  );
}

function Shell({
  mode,
  setMode,
  ticker,
  error,
  clearError,
  children,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  ticker: React.ReactNode;
  error: string | null;
  clearError: () => void;
  children: React.ReactNode;
}) {
  return (
    <section id="console" className="mx-auto w-full max-w-6xl px-5 pb-24">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex border border-ink text-[11px]">
            {(["chain", "sim"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`num px-3 py-1 uppercase tracking-[0.15em] transition ${mode === m ? "bg-ink text-paper" : "hover:bg-paper-2"}`}
              >
                {m === "chain" ? `On-chain · ${DEPLOYMENT.cluster}` : "Simulation"}
              </button>
            ))}
          </div>
          <h2 className="font-display text-4xl md:text-5xl">Your crypto, working at checkout.</h2>
        </div>
        {ticker}
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between border border-vermilion/40 bg-vermilion/10 px-4 py-2 text-sm text-vermilion">
          <span>{error}</span>
          <button className="num text-xs underline" onClick={clearError}>
            dismiss
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-12">{children}</div>
    </section>
  );
}

function WalletBar({
  balances,
  busy,
  onFaucet,
}: {
  balances: Balances | null;
  busy: string | null;
  onFaucet: () => void;
}) {
  const { wallets, wallet, publicKey, select, connect, disconnect, connecting } = useWallet();  const [open, setOpen] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    if (wallet && !publicKey && pending.current) {
      pending.current = false;
      connect().catch(() => {});
    }
  }, [wallet, publicKey, connect]);

  const choose = (name: WalletName) => {
    pending.current = true;
    select(name);
    setOpen(false);
  };

  const addr = publicKey?.toBase58();
  return (
    <div className="receipt flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
      {addr ? (
        <>
          <span className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-mint" />
            <span className="font-medium">{wallet?.adapter.name}</span>
            <a
              className="num text-xs text-ink-soft underline decoration-dotted"
              href={explorerAddress(addr)}
              target="_blank"
              rel="noreferrer"
            >
              {addr.slice(0, 4)}…{addr.slice(-4)}
            </a>
          </span>
          {balances && (
            <span className="num flex gap-4 text-xs text-ink-soft">
              <span>{balances.SOL.toFixed(3)} SOL</span>
              <span>{balances.zenZEC.toFixed(4)} zenZEC</span>
              <span>{usd(balances.USDC)} USDC</span>
            </span>
          )}
          <span className="ml-auto flex gap-2">
            <button
              onClick={onFaucet}
              disabled={!!busy}
              className="num border border-ink px-3 py-1.5 text-xs transition hover:bg-paper-2 disabled:opacity-40"
            >
              {busy === "faucet" ? "Sending…" : "Get test funds"}
            </button>
            <button onClick={() => disconnect()} className="num px-2 py-1.5 text-xs text-ink-soft underline">
              disconnect
            </button>
          </span>
        </>
      ) : (
        <>
          <span className="text-sm text-ink-soft">
            Real transactions on Solana {DEPLOYMENT.cluster}. No wallet? The demo wallet signs in your browser.
          </span>
          <span className="relative ml-auto flex gap-2">
            <button
              onClick={() => choose(DemoWalletName)}
              disabled={connecting}
              className="bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-mint"
            >
              {connecting ? "Connecting…" : "Use demo wallet"}
            </button>
            {wallets.some((w) => w.adapter.name !== DemoWalletName) && (
              <button onClick={() => setOpen((o) => !o)} className="border border-ink px-4 py-2 text-sm">
                Connect wallet
              </button>
            )}
            {open && (
              <div className="absolute right-0 top-full z-10 mt-1 min-w-48 border border-ink bg-paper">
                {wallets
                  .filter((w) => w.adapter.name !== DemoWalletName)
                  .map((w) => (
                    <button
                      key={w.adapter.name}
                      onClick={() => choose(w.adapter.name)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-paper-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={w.adapter.icon} alt="" className="h-4 w-4" />
                      {w.adapter.name}
                    </button>
                  ))}
              </div>
            )}
          </span>
        </>
      )}
    </div>
  );
}

function SimConsole({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
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
    <Shell
      mode={mode}
      setMode={setMode}
      ticker={
        <PriceTicker
          label={live ? `oracle: ${live.source}` : "oracle: offline (demo prices)"}
          ok={!!live}
          prices={state.prices}
          shock={shock}
        />
      }
      error={error}
      clearError={() => setError(null)}
    >
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
    </Shell>
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
  label,
  ok,
  prices,
  shock,
}: {
  label: string;
  ok: boolean;
  prices: Record<AssetId, number>;
  shock: number;
}) {
  return (
    <div className="num flex items-center gap-4 border border-rule bg-paper-2/60 px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-mint" : "bg-amber"}`} />
        {label}
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
  balances,
  busy,
  defaultAmount = "25",
  onDeposit,
  onWithdraw,
}: {
  state: State;
  balances?: Balances;
  defaultAmount?: string;
  busy?: boolean;
  onDeposit: (a: AssetId, x: number) => void;
  onWithdraw: (a: AssetId, x: number) => void;
}) {
  const [asset, setAsset] = useState<AssetId>("SOL");
  const [amount, setAmount] = useState(defaultAmount);
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
      <label className="num mb-1 flex justify-between text-[11px] uppercase tracking-widest text-ink-soft">
        <span>Amount ({asset})</span>
        {balances && (
          <button className="underline decoration-dotted" onClick={() => setAmount(String(Math.max(0, asset === "SOL" ? balances.SOL - 0.05 : balances[asset]).toFixed(4).replace(/\.?0+$/, "")))}>
            wallet {balances[asset].toLocaleString("en-US", { maximumFractionDigits: 4 })}
          </button>
        )}
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
          disabled={busy}
          className="bg-ink px-3 py-2.5 text-sm font-medium text-paper transition hover:bg-mint disabled:bg-ink/40"
        >
          {busy ? "Signing…" : "Lock collateral"}
        </button>
        <button
          onClick={() => onWithdraw(asset, x)}
          disabled={busy}
          className="border border-ink px-3 py-2.5 text-sm font-medium transition hover:bg-paper-2 disabled:opacity-40"
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
  busy,
  onPay,
  receipt,
}: {
  available: number;
  busy?: boolean;
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
        disabled={c.price > available || busy}
        className="mt-3 w-full bg-ink px-3 py-3 text-sm font-medium text-paper transition hover:bg-mint disabled:cursor-not-allowed disabled:bg-ink/30"
      >
        {busy
          ? rail === "tempo"
            ? "Paying on Solana, relaying to Tempo…"
            : "Paying merchant…"
          : c.price > available
            ? `Need ${usd(c.price - available)} more credit`
            : `Pay 4 × ${usd(c.price / 4)} with HodlPay`}
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
  busy,
  creditBalance = 0,
  onRepay,
  onAdvance,
}: {
  state: State;
  busy?: boolean;
  creditBalance?: number;
  onRepay: (id: string) => void;
  onAdvance?: () => void;
}) {
  return (
    <Card title="Installments" kicker="04 · repay">
      <div className="mb-3 flex items-center justify-between">
        <p className="num text-xs text-ink-soft">
          Today: {new Date(state.now).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {creditBalance > 0.005 && (
            <span className="ml-3 text-mint">
              {usd(creditBalance)} prepaid from liquidation, applied to your next installments
            </span>
          )}
        </p>
        {onAdvance && (
          <button onClick={onAdvance} className="num border border-ink px-2.5 py-1 text-xs transition hover:bg-paper-2">
            +{PROTOCOL.installmentIntervalDays} days →
          </button>
        )}
      </div>
      {state.loans.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-soft">No purchases yet. Lock collateral, then check out.</p>
      ) : (
        <div className="divide-y divide-dashed divide-rule">
          {state.loans.map((l) => {
            const left = outstanding(l);
            const next = l.installments.find((i) => i.paidAt === null);
            const overdue = next && next.dueAt < state.now - 24 * 60 * 60 * 1000;
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
                  disabled={!next || busy}
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
  onCommit,
  status,
  busy,
  onLiquidate,
  note,
}: {
  shock: number;
  setShock: (n: number) => void;
  /** Called when the user releases the slider; on-chain mode posts the shocked price. */
  onCommit?: (n: number) => void;
  status: ReturnType<typeof metrics>["status"];
  busy?: boolean;
  onLiquidate: () => void;
  note?: string;
}) {
  const commit = (n: number) => onCommit?.(n);
  return (
    <Card title="Risk desk" kicker="05 · stress test" className={status === "liquidatable" ? "outline outline-2 outline-vermilion" : ""}>
      <p className="text-sm text-ink-soft">
        Simulate a market move on top of live oracle prices.{note ? ` ${note}` : ""}
      </p>
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
        onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value) / 100)}
        onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value) / 100)}
        disabled={busy}
        className="mt-2 w-full"
      />
      <div className="num flex justify-between text-[10px] text-ink-soft">
        <span>-70%</span>
        <button
          className="underline"
          onClick={() => {
            setShock(0);
            commit(0);
          }}
        >
          {busy ? "posting…" : "reset"}
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
        disabled={status !== "liquidatable" || busy}
        className="mt-3 w-full border border-vermilion px-3 py-2.5 text-sm font-medium text-vermilion transition hover:bg-vermilion hover:text-paper disabled:border-rule disabled:text-ink-soft disabled:hover:bg-transparent"
      >
        Run keeper: partial liquidation
      </button>
    </Card>
  );
}

function Ledger({ state, onchain }: { state: State; onchain?: boolean }) {
  const color: Record<string, string> = {
    margin: "text-amber",
    liquidation: "text-vermilion",
    checkout: "text-mint",
    repay: "text-mint",
  };
  return (
    <Card title="Ledger" kicker="06 · events">
      {state.events.length === 0 ? (
        <p className="text-sm text-ink-soft">
          {onchain
            ? "Every action is a real transaction. Click through to the explorer."
            : "Every action is recorded here, as it would be on-chain."}
        </p>
      ) : (
        <ul className="num max-h-64 space-y-1 overflow-auto text-xs">
          {state.events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-24 shrink-0 text-ink-soft">
                {new Date(e.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                {new Date(e.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </span>
              <span className={`w-20 shrink-0 uppercase ${color[e.kind] ?? ""}`}>{e.kind}</span>
              <span className="flex-1">{e.message}</span>
              {e.sig && (
                <a
                  className="shrink-0 text-ink-soft underline decoration-dotted"
                  href={e.sig.startsWith("0x") ? tempoExplorerTx(e.sig) : explorerTx(e.sig)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {e.sig.slice(0, 8)}…
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
