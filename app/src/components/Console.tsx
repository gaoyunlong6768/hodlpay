"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import WalletProviders from "@/components/WalletProviders";
import { Card, PriceTicker, Row, Skel, WalletBar, useWalletRestoring } from "@/components/ui";
import { DEPLOYMENT, TEMPO, explorerTx, tempoExplorerTx } from "@/lib/hodlpay";
import { payPath } from "@/lib/paylink";
import { CATALOG, MERCHANTS, useOnchain, type Balances, type OnchainView } from "@/lib/useOnchain";
import {
  ASSETS,
  PROTOCOL,
  advanceDays,
  checkout,
  creditLevel,
  deposit,
  initialState,
  liquidate,
  maxLtvFor,
  metrics,
  outstanding,
  repayNext,
  setPrice,
  usd,
  withdraw,
  type AssetId,
  type CreditRecord,
  type Loan,
  type Rail,
  type State,
} from "@/lib/engine";

const FALLBACK_PRICES: Record<AssetId, number> = { SOL: 120, zenZEC: 1500 };

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

function useLivePrices() {
  const [live, setLive] = useState<PriceFeed | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/prices", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<PriceFeed>) : null))
        .then((feed) => {
          if (alive && feed) setLive(feed);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return live;
}

function ConsoleInner() {
  const [mode, setMode] = useState<Mode>("chain");
  const live = useLivePrices();
  return mode === "chain" ? (
    <ChainConsole mode={mode} setMode={setMode} live={live} />
  ) : (
    <SimConsole mode={mode} setMode={setMode} live={live} />
  );
}

function ChainConsole({ mode, setMode, live }: { mode: Mode; setMode: (m: Mode) => void; live: PriceFeed | null }) {
  const chain = useOnchain();
  const { view, busy, actions } = chain;
  const restoring = useWalletRestoring();
  const [shock, setShock] = useState(0);
  const [showReceipt, setShowReceipt] = useState(false);
  const empty = useMemo(() => initialState(live?.prices ?? FALLBACK_PRICES), [live]);
  const state = view?.state ?? empty;
  const m = useMemo(() => metrics(state, view?.debt ?? 0), [state, view?.debt]);
  const loading = !view && (restoring || !!chain.owner);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShock(chain.shock);
  }, [chain.shock]);

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
          label={
            view
              ? `on-chain oracle · ${view.priceAge}s ago`
              : loading
                ? "reading on-chain oracle…"
                : live
                  ? `market · ${live.source}`
                  : `${DEPLOYMENT.cluster} · connect to load`
          }
          ok={!!view && view.priceAge < 120}
          prices={view?.state.prices ?? (loading ? null : (live?.prices ?? null))}
          shock={shock}
        />
      }
      error={chain.error}
      clearError={() => chain.setError(null)}
    >
      <div className="lg:col-span-12">
        <WalletBar balances={view?.balances ?? null} busy={busy} onFaucet={actions.faucet} />
      </div>
      {(m.status === "margin" || m.status === "liquidatable") && (
        <div
          className={`lg:col-span-12 flex flex-wrap items-center gap-x-4 gap-y-1 border px-5 py-3 text-sm ${
            m.status === "liquidatable" ? "border-vermilion bg-vermilion/10 text-vermilion" : "border-amber bg-amber/10 text-amber"
          }`}
        >
          <span className="num text-xs font-medium uppercase tracking-widest">
            {m.status === "liquidatable" ? "Liquidation risk" : "Margin alert"} · LTV {(m.ltv * 100).toFixed(1)}%
          </span>
          <span className="text-ink">
            Repay {usd(m.debt - m.borrowLimit)} or lock about{" "}
            {((m.debt - m.borrowLimit) / (state.prices.zenZEC * maxLtvFor("zenZEC", state.credit))).toFixed(2)} more zenZEC to get back
            under your max LTV.
            {m.status === "liquidatable" && " Until then the keeper may sell part of your collateral."}
          </span>
        </div>
      )}
      {view && (
        <OverdueBanner
          state={state}
          creditBalance={view.creditBalance}
          graceDays={view.gracePeriodDays}
          lateFeePct={view.lateFeeBps / 100}
          busy={busy === "repay"}
          onRepay={guard(actions.repayMany)}
        />
      )}
      {view?.tempoPending.map((p) => (
        <div
          key={p.loan}
          className="lg:col-span-12 flex flex-wrap items-center gap-x-4 gap-y-1 border border-tempo bg-tempo/10 px-5 py-3 text-sm"
        >
          <span className="num text-xs font-medium uppercase tracking-widest text-tempo">Tempo payout pending</span>
          <span className="text-ink">
            {p.item} is financed on Solana; the {TEMPO.token} payout to {p.merchant} has not gone through yet.
          </span>
          <button
            onClick={() => actions.retryTempo(p.loan)}
            disabled={!!busy}
            className="num ml-auto border border-tempo px-3 py-1.5 text-xs text-tempo transition hover:bg-tempo hover:text-paper disabled:opacity-40"
          >
            {busy === "tempo" ? "Relaying…" : "Retry payout"}
          </button>
        </div>
      ))}
      <div className="lg:col-span-4">
        <Vault
          state={state}
          balances={view?.balances}
          defaultAsset="zenZEC"
          defaultAmount="2"
          loading={loading}
          priced={!!view || !!live}
          busy={busy === "deposit" || busy === "withdraw"}
          onDeposit={guard(actions.deposit)}
          onWithdraw={guard(actions.withdraw)}
        />
      </div>
      <div className="lg:col-span-4">
        <CreditLine m={m} credit={state.credit} loading={loading} />
      </div>
      <div className="lg:col-span-4">
        <Checkout
          available={m.available}
          cash={view ? view.balances.USDC + view.creditBalance : undefined}
          loading={loading}
          busy={busy === "checkout"}
          onPay={guard(async (input: Parameters<typeof actions.checkout>[0]) => {
            setShowReceipt(false);
            await actions.checkout(input);
            setShowReceipt(true);
          })}
          receipt={showReceipt ? (state.loans.find((l) => l.id === chain.lastCheckout?.loan) ?? null) : null}
          receiptPending={!!view?.tempoPending.some((p) => p.loan === chain.lastCheckout?.loan)}
        />
      </div>
      <div className="lg:col-span-8">
        <Installments
          state={state}
          loading={loading}
          busy={busy === "repay"}
          creditBalance={view?.creditBalance ?? 0}
          overdueTerms={view ? { graceDays: view.gracePeriodDays, lateFeePct: view.lateFeeBps / 100 } : undefined}
          onRepay={guard(actions.repay)}
          onPayOff={guard(actions.payOff)}
        />
      </div>
      <div className="lg:col-span-4">
        <RiskDesk
          shock={shock}
          setShock={setShock}
          committed={chain.shock}
          onCommit={(s) => actions.shock(s)}
          status={m.status}
          underwater={m.ltv > 1 / (1 + PROTOCOL.liquidationBonus)}
          busy={busy === "shock" || busy === "liquidate"}
          onLiquidate={guard(actions.liquidate)}
          note="Moves the shared oracle price on this demo deployment; it snaps back to live prices after 3 minutes."
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
    <Card title="Lend" kicker="06 · liquidity pool">
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">{children}</div>
    </section>
  );
}


function SimConsole({ mode, setMode, live }: { mode: Mode; setMode: (m: Mode) => void; live: PriceFeed | null }) {
  const [state, setState] = useState<State>(() => initialState(live?.prices ?? FALLBACK_PRICES));
  const [shock, setShock] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Loan | null>(null);

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
          <Vault state={state} onDeposit={(a, x) => act((s) => deposit(s, a, x))} onWithdraw={(a, x) => act((s) => withdraw(s, a, x))} />
        </div>
        <div className="lg:col-span-4">
          <CreditLine m={m} credit={state.credit} />
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
            onRepay={(id) => act((s) => repayNext(s, id))}
            onAdvance={() => act((s) => advanceDays(s, PROTOCOL.installmentIntervalDays))}
          />
        </div>
        <div className="lg:col-span-4">
          <RiskDesk
            shock={shock}
            setShock={setShock}
            status={m.status}
            onLiquidate={() => act(liquidate)}
          />
        </div>

        <div className="lg:col-span-12">
          <Ledger state={state} />
        </div>
    </Shell>
  );
}



const ZENROCK_MINT_URL = "https://app.zenrocklabs.io/services/zenzec/crucible/mint";
const ZENZEC_MAINNET = "JDt9rRGaieF6aN1cJkXFeUmsy7ZE4yY3CZb8tVMXVroS";

function ZcashBridge() {
  const [open, setOpen] = useState(false);
  const link = (href: string, text: string) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-ink">
      {text}
    </a>
  );
  return (
    <div className="mt-2 text-[11px] leading-relaxed text-ink-soft">
      <button onClick={() => setOpen((o) => !o)} className="num underline decoration-dotted hover:text-ink">
        {open ? "Hide" : "Holding ZEC? Bring it from Zcash →"}
      </button>
      {open && (
        <div className="mt-2 border border-rule bg-paper-2/60 p-3">
          <p className="font-medium text-ink">From shielded ZEC to spending power, without selling</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            <li>Keep your ZEC shielded in Zashi or any Zcash wallet.</li>
            <li>
              Open {link(ZENROCK_MINT_URL, "Zenrock")} with this Solana wallet to get a ZEC deposit address bound to it. Send
              at least 0.1 ZEC; after 3 Zcash confirmations (about 5 minutes) zenZEC is minted 1:1, held by a decentralized
              MPC custody network.
            </li>
            <li>
              Lock zenZEC here. It has its own risk tier, 40% max LTV against 50% for SOL, to price in bridge and liquidity
              risk.
            </li>
            <li>Repay, unlock, and burn zenZEC on Zenrock: your ZEC comes back to a shielded address.</li>
          </ol>
          <p className="mt-2">
            <span className="text-ink">Private:</span> your shielded balance and history. Sending from a shielded address
            does not reveal where the ZEC came from. <span className="text-ink">Public:</span> the zenZEC you lock and your
            loans on Solana, like any DeFi position.
          </p>
          <p className="mt-2">
            On {DEPLOYMENT.cluster}, <em>Get test funds</em> gives you test zenZEC. On mainnet the vault takes Zenrock&apos;s
            zenZEC ({link(`https://explorer.solana.com/address/${ZENZEC_MAINNET}`, `${ZENZEC_MAINNET.slice(0, 4)}…${ZENZEC_MAINNET.slice(-4)}`)})
            as is: a classic SPL token with 8 decimals and no freeze authority.
          </p>
        </div>
      )}
    </div>
  );
}

function Vault({
  state,
  balances,
  busy,
  defaultAsset = "SOL",
  defaultAmount = "25",
  loading,
  priced = true,
  onDeposit,
  onWithdraw,
}: {
  state: State;
  balances?: Balances;
  defaultAsset?: AssetId;
  defaultAmount?: string;
  loading?: boolean;
  /** False until real prices arrive; `state.prices` is only a placeholder then. */
  priced?: boolean;
  busy?: boolean;
  onDeposit: (a: AssetId, x: number) => void;
  onWithdraw: (a: AssetId, x: number) => void;
}) {
  const [asset, setAsset] = useState<AssetId>(defaultAsset);
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
                  {a.chain} · max LTV {+(maxLtvFor(id, state.credit) * 100).toFixed(1)}%
                </span>
              </span>
              <span className="num text-right text-sm">
                {loading ? (
                  <Skel className="w-14" />
                ) : (
                  <>
                    <span className="block">{locked.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
                    <span className="block text-[11px] opacity-70">{usd(locked * state.prices[id])}</span>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="dash my-4" />
      <label className="num mb-1 flex justify-between text-[11px] uppercase tracking-widest text-ink-soft">
        <span>Amount ({asset})</span>
        {balances && (
          <button className="underline decoration-dotted" onClick={() => setAmount(String(Math.floor(Math.max(0, asset === "SOL" ? balances.SOL - 0.05 : balances[asset]) * 1e4) / 1e4))}>
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
        {priced ? (
          <>
            ≈ {usd((Number.isFinite(x) ? x : 0) * state.prices[asset])} · adds{" "}
            {usd((Number.isFinite(x) ? x : 0) * state.prices[asset] * maxLtvFor(asset, state.credit))} credit
          </>
        ) : (
          <Skel className="w-40" />
        )}
      </p>
      {asset === "zenZEC" && <ZcashBridge />}
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

function CreditLadder({ credit, loading }: { credit: CreditRecord; loading?: boolean }) {
  const { stepUsd, stepLtv, maxLevel } = PROTOCOL.credit;
  const level = creditLevel(credit);
  const pts = (l: number) => `${(l * stepLtv * 100).toFixed(1)} pts`;
  return (
    <div className="dash mt-4 pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-[11px] uppercase tracking-widest text-ink-soft">On-time credit</span>
        <span className="num text-xs font-medium">
          {loading ? <Skel className="w-24" /> : `Level ${level}/${maxLevel} · max LTV +${pts(level)}`}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1" aria-hidden>
        {Array.from({ length: maxLevel }, (_, i) => (
          <div key={i} className="relative h-1.5 border border-ink/30 bg-paper-2">
            <div
              className="absolute inset-y-0 left-0 bg-mint transition-all duration-500"
              style={{ width: `${Math.min(1, Math.max(0, credit.onTimeRepaid / stepUsd - i)) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <p className="num mt-2 text-[11px] leading-relaxed text-ink-soft">
        {level < maxLevel
          ? `Repay ${usd(stepUsd * (level + 1) - credit.onTimeRepaid)} more on time for +${pts(level + 1)}. `
          : `Top level: +${pts(maxLevel)} on every asset. `}
        Collateral replaces the credit check; each on-time installment after checkout lowers the collateral you need. A late
        payment or collection resets it.
      </p>
    </div>
  );
}

function CreditLine({ m, credit, loading }: { m: ReturnType<typeof metrics>; credit: CreditRecord; loading?: boolean }) {
  const tone = loading
    ? "text-ink-soft"
    : m.status === "liquidatable"
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
      <p className="font-display text-6xl leading-none">{loading ? <Skel className="w-44" /> : usd(m.available)}</p>
      <p className="num mt-2 text-xs text-ink-soft">
        {loading ? "Reading your position…" : `of ${usd(m.borrowLimit)} limit · ${usd(m.debt)} owed`}
      </p>

      <div className="mt-6">
        <div className="mb-1 flex justify-between text-xs">
          <span className="num text-ink-soft">LTV {loading ? "—" : `${(m.ltv * 100).toFixed(1)}%`}</span>
          <span className={`num font-medium ${tone}`}>
            <span
              className={`mr-1.5 inline-block h-2 w-2 rounded-full bg-current ${m.status === "liquidatable" && !loading ? "alarm" : ""}`}
            />
            {loading ? "Loading" : label}
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
        <Row k="Collateral value" v={loading ? <Skel /> : usd(m.collateralValue)} />
        <Row k="Margin alert at" v={loading ? <Skel /> : usd(m.marginLimit)} />
        <Row k="Liquidation at" v={loading ? <Skel /> : usd(m.liquidationLimit)} />
        <Row
          k="Price drop to liquidation"
          v={loading ? <Skel className="w-10" /> : m.debt > 0 ? `${(m.dropToLiquidation * 100).toFixed(1)}%` : "—"}
          strong
        />
      </div>
      <CreditLadder credit={credit} loading={loading} />
    </Card>
  );
}


function Checkout({
  available,
  cash,
  loading,
  busy,
  onPay,
  receipt,
  receiptPending,
}: {
  available: number;
  /** USDC the shopper can put toward the first installment; unknown in simulation. */
  cash?: number;
  loading?: boolean;
  busy?: boolean;
  onPay: (i: { merchant: string; item: string; price: number; rail: Rail }) => void;
  receipt: Loan | null;
  /** The receipt's Tempo payout has not gone through yet. */
  receiptPending?: boolean;
}) {
  const [pick, setPick] = useState(0);
  const [rail, setRail] = useState<Rail>("solana");
  const c = CATALOG[pick];
  const fee = (c.price * PROTOCOL.merchantFeeBps) / 10_000;
  const quarter = c.price / PROTOCOL.installments;
  const paysFirst = cash === undefined || cash >= quarter;

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
        disabled={loading || c.price > available || busy}
        className="mt-3 w-full bg-ink px-3 py-3 text-sm font-medium text-paper transition hover:bg-mint disabled:cursor-not-allowed disabled:bg-ink/30"
      >
        {busy
          ? rail === "tempo"
            ? "Paying on Solana, relaying to Tempo…"
            : "Paying merchant…"
          : loading
            ? "Loading your credit line…"
            : c.price > available
            ? `Need ${usd(c.price - available)} more credit`
            : paysFirst
              ? `Pay ${usd(quarter)} today with HodlPay`
              : `Buy now, pay ${usd(quarter)} later`}
      </button>
      <p className="num mt-1.5 text-[11px] text-ink-soft">
        {paysFirst
          ? `Then 3 × ${usd(quarter)}, every ${PROTOCOL.installmentIntervalDays} days · 0% interest`
          : `Not enough USDC for the first ${usd(quarter)} now: it is due today, 3 more every ${PROTOCOL.installmentIntervalDays} days · 0% interest`}
      </p>
      <p className="num mt-0.5 text-[11px] text-ink-soft">
        Merchant gets {usd(c.price - fee)} now · fee {PROTOCOL.merchantFeeBps / 100}%
      </p>
      <Link
        href={payPath({
          merchant: c.merchant,
          item: c.item,
          amount: c.price,
          rail,
          to: MERCHANTS[c.merchant]?.toBase58(),
          tempo: TEMPO.merchants[c.merchant],
        })}
        className="num mt-1 inline-block text-[11px] underline decoration-dotted"
      >
        Or pay through the merchant&apos;s hosted checkout link →
      </Link>
      <Link href="/scan" className="num ml-3 mt-1 inline-block text-[11px] underline decoration-dotted">
        Or scan any Solana Pay QR →
      </Link>

      {receipt && <Receipt loan={receipt} pending={receiptPending} />}
    </Card>
  );
}

function Receipt({ loan, pending }: { loan: Loan; pending?: boolean }) {
  return (
    <div key={loan.id} className="print receipt-edge mt-4 bg-paper-2 px-4 pb-3 pt-4 text-xs">
      <p className="num text-center uppercase tracking-[0.3em]">
        {pending ? "Financed · Tempo payout pending" : `Paid · ${loan.rail === "solana" ? "Solana" : "Tempo"}`}
      </p>
      <div className="dash my-2" />
      <Row k={loan.merchant} v={usd(loan.merchantReceived)} />
      <Row k="Collateral sold" v="0" />
      <Row k="Interest" v="0%" />
      <div className="dash my-2" />
      {loan.installments.map((i) => (
        <div key={i.index} className="num flex justify-between">
          <span>
            #{i.index + 1} · {new Date(i.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
          <span>
            {usd(i.amount)}
            {i.paidAt !== null && " · paid"}
          </span>
        </div>
      ))}
    </div>
  );
}

function nextDue(l: Loan) {
  return l.installments.find((i) => i.paidAt === null)?.dueAt ?? Infinity;
}

/** Liquidation credit pays the next installments first, earliest due first (repay and collect_overdue). */
function creditCoverage(loans: Loan[], creditBalance: number) {
  const covered = new Map<string, number>();
  let credit = creditBalance;
  for (const l of [...loans].sort((a, b) => nextDue(a) - nextDue(b))) {
    const next = l.installments.find((i) => i.paidAt === null);
    if (!next || credit <= 0.005) continue;
    const c = Math.min(credit, next.amount);
    covered.set(l.id, c);
    credit -= c;
  }
  return covered;
}

const DAY_MS = 86_400_000;

function OverdueBanner({
  state,
  creditBalance,
  graceDays,
  lateFeePct,
  busy,
  onRepay,
}: {
  state: State;
  creditBalance: number;
  graceDays: number;
  lateFeePct: number;
  busy?: boolean;
  onRepay: (loans: string[]) => void;
}) {
  const covered = creditCoverage(state.loans, creditBalance);
  const overdue = state.loans.flatMap((l) => {
    const next = l.installments.find((i) => i.paidAt === null);
    const cash = next ? next.amount - (covered.get(l.id) ?? 0) : 0;
    return next && cash > 0.005 && next.dueAt < state.now - DAY_MS
      ? [{ id: l.id, cash, collectAt: next.dueAt + graceDays * DAY_MS }]
      : [];
  });
  if (!overdue.length) return null;

  const first = Math.min(...overdue.map((o) => o.collectAt));
  const pastGrace = state.now >= first;
  const total = overdue.reduce((s, o) => s + o.cash, 0);
  const due = overdue.reduce((s, o) => s + o.cash * (state.now >= o.collectAt ? 1 + lateFeePct / 100 : 1), 0);
  const left = Math.max(0, first - state.now);
  const hours = Math.floor(left / 3_600_000);
  const countdown = hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${Math.floor((left % 3_600_000) / 60_000)}m`;
  const when = new Date(first).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const n = overdue.length;

  return (
    <div className="lg:col-span-12 flex flex-wrap items-center gap-x-4 gap-y-2 border border-vermilion bg-vermilion/10 px-5 py-3 text-sm">
      <span className="num text-xs font-medium uppercase tracking-widest text-vermilion">
        Overdue · {n} installment{n > 1 ? "s" : ""} · {usd(total)}
      </span>
      <span className="text-ink">
        {pastGrace
          ? `The ${graceDays}-day grace period has ended: the keeper collects ${n > 1 ? "them" : "it"} from your collateral with a ${lateFeePct}% late fee on its next hourly run.`
          : `Repay by ${when} (in ${countdown}) or the keeper collects ${n > 1 ? "them" : "it"} from your collateral with a ${lateFeePct}% late fee.`}
      </span>
      <button
        onClick={() => onRepay(overdue.map((o) => o.id))}
        disabled={busy}
        className="num ml-auto border border-vermilion px-3 py-1.5 text-xs text-vermilion transition hover:bg-vermilion hover:text-paper disabled:opacity-40"
      >
        {busy ? "Signing…" : `Repay ${usd(due)} now`}
      </button>
    </div>
  );
}

function Installments({
  state,
  loading,
  busy,
  creditBalance = 0,
  overdueTerms,
  onRepay,
  onPayOff,
  onAdvance,
}: {
  state: State;
  loading?: boolean;
  busy?: boolean;
  creditBalance?: number;
  /** On-chain terms for installments left unpaid: collected from collateral after the grace period. */
  overdueTerms?: { graceDays: number; lateFeePct: number };
  onRepay: (id: string) => void;
  onPayOff?: (id: string) => void;
  onAdvance?: () => void;
}) {
  const covered = creditCoverage(state.loans, creditBalance);
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
      {loading ? (
        <p className="animate-pulse py-8 text-center text-sm text-ink-soft">Loading your purchases…</p>
      ) : state.loans.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-soft">No purchases yet. Lock collateral, then check out.</p>
      ) : (
        <div className="divide-y divide-dashed divide-rule">
          {state.loans.map((l) => {
            const left = outstanding(l);
            const next = l.installments.find((i) => i.paidAt === null);
            const fromCredit = covered.get(l.id) ?? 0;
            const cash = next ? Math.max(0, next.amount - fromCredit) : 0;
            const prepaid = !!next && cash < 0.005;
            const overdue = next && !prepaid && next.dueAt < state.now - DAY_MS;
            const missed = overdueTerms && next && next.dueAt < state.now;
            const collectAt = next && overdueTerms ? next.dueAt + overdueTerms.graceDays * 86_400_000 : 0;
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
                      title={i.collected ? `${usd(i.amount)} · collected from collateral` : usd(i.amount)}
                      className={`h-3 w-7 border ${
                        i.collected
                          ? "border-vermilion bg-vermilion"
                          : i.paidAt !== null
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
                  <span className={`block text-[11px] ${overdue ? "text-vermilion" : prepaid ? "text-mint" : "text-ink-soft"}`}>
                    {next
                      ? `${overdue ? "overdue" : "due"} ${new Date(next.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}${prepaid ? " · prepaid" : ""}`
                      : "paid off"}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    disabled={!next || busy}
                    onClick={() => onRepay(l.id)}
                    className="bg-ink px-3 py-2 text-xs font-medium text-paper transition hover:bg-mint disabled:bg-ink/20"
                  >
                    {!next ? "Done" : prepaid ? "Settle from credit" : `Repay ${usd(cash)}`}
                  </button>
                  {onPayOff && next && l.installments.filter((i) => i.paidAt === null).length > 1 && (
                    <button
                      disabled={busy}
                      onClick={() => onPayOff(l.id)}
                      title="Repay every remaining installment now, no interest"
                      className="border border-ink px-3 py-2 text-xs transition hover:bg-paper-2 disabled:opacity-40"
                    >
                      Pay off {usd(Math.max(0, left - creditBalance))}
                    </button>
                  )}
                </div>
                {l.installments.map(
                  (i) =>
                    i.collected && (
                      <p key={`c${i.index}`} className="num basis-full text-[11px] text-ink-soft">
                        <span className="text-vermilion">
                          Installment {i.index + 1} collected from collateral
                          {i.collected.at > 0 &&
                            ` on ${new Date(i.collected.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                        </span>
                        : {usd(i.collected.paid)} + {usd(i.collected.lateFee)} late fee,{" "}
                        {i.collected.seized.toLocaleString("en-US", { maximumFractionDigits: 4 })} {i.collected.asset} taken
                        (incl. 5% bonus) ·{" "}
                        <a href={explorerTx(i.collected.sig)} target="_blank" rel="noreferrer" className="underline">
                          tx
                        </a>
                      </p>
                    ),
                )}
                {missed && overdueTerms && prepaid && (
                  <p className="basis-full text-[11px] text-mint">
                    Covered by your liquidation credit: settled from it with no late fee when you press the button, or by
                    the keeper{" "}
                    {state.now < collectAt
                      ? `on ${new Date(collectAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : "on its next hourly run"}
                    . No collateral is taken.
                  </p>
                )}
                {missed && overdueTerms && !prepaid && (
                  <p className="basis-full text-[11px] text-vermilion">
                    {fromCredit > 0.005 && `${usd(fromCredit)} comes from your liquidation credit. `}
                    {state.now < collectAt
                      ? `Unpaid. If it is still unpaid on ${new Date(collectAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, the keeper collects it from your collateral with a ${overdueTerms.lateFeePct}% late fee.`
                      : `Past the ${overdueTerms.graceDays}-day grace period: the keeper is collecting it from your collateral with a ${overdueTerms.lateFeePct}% late fee.`}
                  </p>
                )}
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
  committed = 0,
  onCommit,
  status,
  underwater,
  busy,
  onLiquidate,
  note,
}: {
  shock: number;
  setShock: (n: number) => void;
  /** Shock currently posted on-chain; releasing the slider on the same value posts nothing. */
  committed?: number;
  /** Called when the user releases the slider; on-chain mode posts the shocked price. */
  onCommit?: (n: number) => void;
  status: ReturnType<typeof metrics>["status"];
  /** Collateral is worth less than debt plus the liquidation bonus. */
  underwater?: boolean;
  busy?: boolean;
  onLiquidate: () => void;
  note?: string;
}) {
  const commit = (n: number) => {
    if (n !== committed) onCommit?.(n);
  };
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
        {status === "liquidatable" && underwater
          ? "Collateral is now worth less than the debt. The keeper still sells what it can; the rest stays on the installment plan, and the liquidity pool carries the risk if it goes unpaid."
          : status === "liquidatable"
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
    <Card title="Ledger" kicker={onchain ? "07 · events" : "06 · events"}>
      {state.events.length === 0 ? (
        <p className="text-sm text-ink-soft">
          {onchain
            ? "Every action is a real transaction. Click through to the explorer."
            : "Every action is recorded here, as it would be on-chain."}
        </p>
      ) : (
        <ul className="num max-h-64 space-y-1 overflow-auto text-xs">
          {state.events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3 border-b border-rule/50 pb-1.5 last:border-0 sm:flex-nowrap sm:border-0 sm:pb-0">
              <span className="w-24 shrink-0 text-ink-soft">
                {new Date(e.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{" "}
                {new Date(e.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </span>
              <span className={`w-20 shrink-0 uppercase ${color[e.kind] ?? ""}`}>{e.kind}</span>
              <span className="order-last basis-full sm:order-none sm:flex-1 sm:basis-auto">{e.message}</span>
              {e.sig && (
                <a
                  className="ml-auto shrink-0 text-ink-soft underline decoration-dotted sm:ml-0"
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
