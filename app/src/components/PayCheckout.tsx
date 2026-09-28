"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import WalletProviders from "@/components/WalletProviders";
import { Card, Row, WalletBar } from "@/components/ui";
import { TEMPO, explorerAddress, explorerTx, tempoExplorerTx } from "@/lib/hodlpay";
import { ASSETS, PROTOCOL, metrics, usd, type AssetId } from "@/lib/engine";
import type { PayRequest } from "@/lib/paylink";
import { useOnchain } from "@/lib/useOnchain";

const DAY = 86_400_000;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function PayCheckout({ request }: { request: PayRequest }) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 px-5 pb-24 md:grid-cols-12">
      <div className="md:col-span-5">
        <Order r={request} />
      </div>
      <div className="md:col-span-7">
        {mounted ? (
          <WalletProviders>
            <Pay r={request} />
          </WalletProviders>
        ) : (
          <div className="receipt h-96" />
        )}
      </div>
    </div>
  );
}

function Order({ r }: { r: PayRequest }) {
  const tempo = r.rail === "tempo";
  const payout = tempo ? r.tempo! : r.to!;
  return (
    <div className="receipt receipt-edge px-6 pb-6 pt-7">
      <p className="num text-center text-[11px] uppercase tracking-[0.35em] text-ink-soft">Checkout</p>
      <h1 className="font-display mt-4 text-4xl leading-tight">{r.merchant}</h1>
      <p className="mt-1 text-ink-soft">{r.item}</p>
      <div className="dash my-5" />
      <p className="num text-[11px] uppercase tracking-widest text-ink-soft">Total</p>
      <p className="font-display text-6xl leading-none">{usd(r.amount)}</p>
      <div className="dash mt-5 pt-2">
        {r.ref && <Row k="Order" v={r.ref} />}
        <Row k="Merchant settles on" v={tempo ? `Tempo · ${TEMPO.token}` : "Solana · USDC"} />
        <div className="flex justify-between py-1 text-sm">
          <span className="text-ink-soft">Payout address</span>
          <a
            className="num underline decoration-dotted"
            href={tempo ? `${TEMPO.explorer}/address/${payout}` : explorerAddress(payout)}
            target="_blank"
            rel="noreferrer"
          >
            {short(payout)}
          </a>
        </div>
      </div>
      <div className="dash mt-4 pt-4 text-sm text-ink-soft">
        Pay with crypto you keep. HodlPay pays {r.merchant} in full right now; you repay in 4 interest-free
        installments, backed by SOL or zenZEC you lock, not sell.
      </div>
    </div>
  );
}

function Pay({ r }: { r: PayRequest }) {
  const chain = useOnchain();
  const { view, busy, actions, lastCheckout } = chain;
  const [picked, setAsset] = useState<AssetId | null>(null);
  const [now] = useState(() => Date.now());

  if (lastCheckout && lastCheckout.item === r.item && lastCheckout.price === r.amount) {
    const loan = view?.state.loans.find((l) => l.id === lastCheckout.loan);
    const firstPaid = loan ? loan.installments[0].paidAt !== null : false;
    return (
      <Paid
        r={r}
        result={lastCheckout}
        firstPaid={firstPaid}
        busy={busy}
        error={chain.error}
        onPayFirst={() => actions.repay(lastCheckout.loan)}
        onRetryTempo={() => actions.retryTempo(lastCheckout.loan)}
      />
    );
  }

  const m = view ? metrics(view.state, view.debt) : null;
  const available = m?.available ?? 0;
  const shortfall = Math.max(0, r.amount - available);
  const plan = (id: AssetId) => {
    const price = view?.state.prices[id] ?? 0;
    const need = price ? Math.ceil(((shortfall * 1.02) / (price * ASSETS[id].maxLtv)) * 1e4) / 1e4 : 0;
    const has = view ? Math.max(0, id === "SOL" ? view.balances.SOL - 0.05 : view.balances[id]) : 0;
    return { price, need, has };
  };
  const ids = Object.keys(ASSETS) as AssetId[];
  const asset = picked ?? ids.find((id) => plan(id).need <= plan(id).has) ?? "SOL";
  const { price, need, has: walletHas } = plan(asset);
  const quarter = r.amount / PROTOCOL.installments;
  const step = !chain.owner ? 1 : shortfall > 0 ? 2 : 3;

  return (
    <div className="space-y-4">
      {chain.error && (
        <div className="flex items-center justify-between border border-vermilion/40 bg-vermilion/10 px-4 py-2 text-sm text-vermilion">
          <span>{chain.error}</span>
          <button className="num text-xs underline" onClick={() => chain.setError(null)}>
            dismiss
          </button>
        </div>
      )}

      <Step n={1} title="Connect a wallet" active={step === 1} done={step > 1}>
        <WalletBar balances={view?.balances ?? null} busy={busy} onFaucet={actions.faucet} />
      </Step>

      <Step n={2} title="Check your HodlPay credit" active={step === 2} done={step > 2}>
        {!chain.owner ? (
          <p className="text-sm text-ink-soft">Your credit line is sized by the collateral in your HodlPay vault.</p>
        ) : !view ? (
          <p className="num text-sm text-ink-soft">Loading your vault…</p>
        ) : (
          <>
            <Row k="Available credit" v={usd(available)} strong />
            <Row k="This purchase" v={usd(r.amount)} />
            {shortfall > 0 ? (
              <div className="dash mt-3 pt-3">
                <p className="text-sm">
                  You need {usd(shortfall)} more credit. Lock collateral to unlock it; you keep the coins and their upside.
                </p>
                <div className="mt-3 grid grid-cols-2 border border-ink text-sm">
                  {ids.map((id) => (
                    <button
                      key={id}
                      onClick={() => setAsset(id)}
                      className={`py-2 transition ${asset === id ? "bg-ink text-paper" : "hover:bg-paper-2"}`}
                    >
                      {id} · max LTV {(ASSETS[id].maxLtv * 100).toFixed(0)}%
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => actions.deposit(asset, need)}
                  disabled={!!busy || need > walletHas}
                  className="mt-3 w-full bg-ink px-3 py-3 text-sm font-medium text-paper transition hover:bg-mint disabled:bg-ink/30"
                >
                  {busy === "deposit" ? "Locking…" : `Lock ${need} ${asset} (${usd(need * price)})`}
                </button>
                {need > walletHas && (
                  <p className="num mt-1.5 text-[11px] text-vermilion">
                    Your wallet has {walletHas.toFixed(4)} {asset}. Use &ldquo;Get test funds&rdquo; above or pick the
                    other asset.
                  </p>
                )}
              </div>
            ) : (
              <p className="num mt-2 text-[11px] text-mint">Covered by your credit line.</p>
            )}
          </>
        )}
      </Step>

      <Step n={3} title="Pay in 4, interest-free" active={step === 3} done={false}>
        <div className="num grid grid-cols-4 gap-2 text-center text-xs">
          {Array.from({ length: PROTOCOL.installments }, (_, i) => (
            <div key={i}>
              <div className={`mb-1 h-2 ${i === 0 ? "bg-mint" : "border border-ink/50"}`} />
              <span className="text-ink-soft">{i === 0 ? "Today" : day(now + i * PROTOCOL.installmentIntervalDays * DAY)}</span>
              <p>{usd(quarter)}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            actions.checkout({ merchant: r.merchant, item: r.item, price: r.amount, rail: r.rail, payTo: r.to, tempoPayTo: r.tempo })
          }
          disabled={step !== 3 || !!busy}
          className="mt-4 w-full bg-ink px-3 py-3.5 text-sm font-medium text-paper transition hover:bg-mint disabled:cursor-not-allowed disabled:bg-ink/30"
        >
          {busy === "checkout"
            ? r.rail === "tempo"
              ? "Paying on Solana, settling on Tempo…"
              : "Paying merchant…"
            : `Buy now · 4 × ${usd(quarter)}`}
        </button>
        <p className="num mt-1.5 text-[11px] text-ink-soft">
          0% interest. Paying more than 3 days late on an installment adds a 1% fee. You can pay off early any time.
        </p>
      </Step>
    </div>
  );
}

function Step({
  n,
  title,
  active,
  done,
  children,
}: {
  n: number;
  title: string;
  active: boolean;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`transition ${active || done ? "" : "opacity-50"}`}>
      <Card title={title} kicker={done ? `step ${n} · done` : `step ${n}`} className={active ? "outline outline-1 outline-ink" : ""}>
        {children}
      </Card>
    </div>
  );
}

function Paid({
  r,
  result,
  firstPaid,
  busy,
  error,
  onPayFirst,
  onRetryTempo,
}: {
  r: PayRequest;
  result: NonNullable<ReturnType<typeof useOnchain>["lastCheckout"]>;
  firstPaid: boolean;
  busy: string | null;
  error: string | null;
  onPayFirst: () => void;
  onRetryTempo: () => void;
}) {
  const quarter = r.amount / PROTOCOL.installments;
  const pending = r.rail === "tempo" && !result.tempoHash;
  return (
    <div className="print receipt receipt-edge px-6 pb-6 pt-7">
      {pending ? (
        <>
          <p className="num text-center text-[11px] uppercase tracking-[0.35em] text-tempo">
            {busy === "checkout" ? "Settling on Tempo" : "Tempo payout pending"}
          </p>
          <p className="font-display mt-4 text-center text-4xl">
            {busy === "checkout" ? `Paying ${r.merchant} on Tempo…` : `Financed. ${r.merchant} has not been paid yet.`}
          </p>
          {busy !== "checkout" && (
            <button
              onClick={onRetryTempo}
              disabled={!!busy}
              className="mt-4 w-full bg-tempo px-3 py-2.5 text-sm font-medium text-paper transition disabled:opacity-40"
            >
              {busy === "tempo" ? "Relaying…" : `Retry ${TEMPO.token} payout`}
            </button>
          )}
        </>
      ) : (
        <>
          <p className="num text-center text-[11px] uppercase tracking-[0.35em] text-mint">Paid</p>
          <p className="font-display mt-4 text-center text-4xl">Thanks. {r.merchant} has been paid.</p>
        </>
      )}
      <div className="dash my-5" />
      <Row
        k={pending ? `${r.merchant} will receive` : `${r.merchant} received`}
        v={`${usd(result.merchantReceived)} ${r.rail === "tempo" ? TEMPO.token : "USDC"}`}
        strong
      />
      <Row k="Collateral sold" v="0" />
      <Row k="First installment" v={firstPaid ? `${usd(quarter)} · paid` : `${usd(quarter)} · due today`} />
      <Row k="Then" v={`3 × ${usd(quarter)}, every ${PROTOCOL.installmentIntervalDays} days`} />
      {!firstPaid && (
        <button
          onClick={onPayFirst}
          disabled={!!busy}
          className="mt-3 w-full border border-ink px-3 py-2.5 text-sm font-medium transition hover:bg-paper-2 disabled:opacity-40"
        >
          {busy === "repay" ? "Paying…" : `Pay first installment now (${usd(quarter)} USDC)`}
        </button>
      )}
      {error && <p className="num mt-2 text-[11px] text-vermilion">{error}</p>}
      <div className="dash mt-4 pt-3 num space-y-1 text-xs">
        <a className="block underline decoration-dotted" href={explorerTx(result.sig)} target="_blank" rel="noreferrer">
          Solana checkout {result.sig.slice(0, 16)}…
        </a>
        {result.tempoHash && (
          <a className="block text-tempo underline decoration-dotted" href={tempoExplorerTx(result.tempoHash)} target="_blank" rel="noreferrer">
            Tempo settlement {result.tempoHash.slice(0, 18)}…
          </a>
        )}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Link href="/#console" className="bg-ink px-4 py-3 text-center text-sm font-medium text-paper transition hover:bg-mint">
          Manage installments
        </Link>
        {r.back ? (
          <a href={r.back} className="border border-ink px-4 py-3 text-center text-sm font-medium transition hover:bg-paper-2">
            Back to {r.merchant}
          </a>
        ) : (
          <Link href="/merchant" className="border border-ink px-4 py-3 text-center text-sm font-medium transition hover:bg-paper-2">
            See it in the merchant portal
          </Link>
        )}
      </div>
    </div>
  );
}
