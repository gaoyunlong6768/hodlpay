"use client";

import { useEffect, useState } from "react";
import { Card, Row, Skel } from "@/components/ui";
import * as hp from "@/lib/hodlpay";
import { usd } from "@/lib/engine";

interface AuditRow {
  hash: string;
  checkoutRef: string;
  merchant: string;
  amount: number;
  at: number;
  contract: string;
  solanaSig: string | null;
  status: "verified" | "mismatch" | "unbacked" | "prelaunch";
  detail: string;
}

interface Audit {
  contract: {
    address: string;
    attesters: string[];
    threshold: number;
    maxPerSettlement: number | null;
    dailyLimit: number | null;
    paused: boolean | null;
    windowSpent: number | null;
    pool: number | null;
  };
  legacy: string[];
  summary: { payouts: number; verified: number; prelaunch: number; failed: number; volume: number };
  rows: AuditRow[];
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const tempoAddress = (a: string) => `${hp.TEMPO.explorer}/address/${a}`;
const when = (t: number) =>
  `${new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${new Date(t).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;

const STATUS: Record<AuditRow["status"], { label: string; cls: string }> = {
  verified: { label: "verified", cls: "border-mint text-mint" },
  prelaunch: { label: "pre-launch test", cls: "border-amber text-amber" },
  mismatch: { label: "mismatch", cls: "border-vermilion text-vermilion" },
  unbacked: { label: "unbacked", cls: "border-vermilion text-vermilion" },
};

export default function TempoAudit() {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tempo/audit")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "audit failed");
        setAudit(body);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const c = audit?.contract;
  const s = audit?.summary;
  const live = s ? s.payouts - s.prelaunch : 0;
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-24">
      <div className="mb-8 max-w-3xl">
        <p className="num mb-3 text-xs uppercase tracking-[0.25em] text-ink-soft">Tempo settlement audit</p>
        <h1 className="font-display text-5xl leading-[0.95] md:text-6xl">
          Don&apos;t trust the relayer. <span className="italic text-tempo">Verify every payout.</span>
        </h1>
        <p className="mt-4 text-lg text-ink-soft">
          Every stablecoin payout on Tempo is re-derived here from the Solana checkout that financed it: same amount, same
          merchant. This page trusts neither the relayer nor the attesters; it reads both chains directly.
        </p>
      </div>

      {error && <p className="mb-5 border border-vermilion px-4 py-3 text-sm text-vermilion">{error}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Card title="Result" kicker="01 · reconciliation">
            <p className="font-display text-5xl">
              {s ? (
                <>
                  {s.verified}
                  <span className="text-ink-soft"> / {live}</span>
                </>
              ) : (
                <Skel className="w-24" />
              )}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {s ? `payouts since the ${hp.DEPLOYMENT.cluster} launch match their Solana checkout` : "Reading Tempo and Solana…"}
            </p>
            <div className="dash mt-4 pt-2">
              <Row k="Volume verified" v={s ? usd(audit!.rows.filter((r) => r.status === "verified").reduce((t, r) => t + r.amount, 0)) : <Skel />} />
              <Row k="Failed checks" v={s ? String(s.failed) : <Skel className="w-6" />} strong />
              <Row k="Pre-launch test payouts" v={s ? String(s.prelaunch) : <Skel className="w-6" />} />
            </div>
            {s && s.prelaunch > 0 && (
              <p className="mt-3 text-[11px] text-ink-soft">
                Pre-launch payouts came from the first, single-relayer contract while we tested against a local validator, so
                their checkouts never existed on {hp.DEPLOYMENT.cluster}. The relayer alone could pay them. That is the trust
                gap the attested contract closes.
              </p>
            )}
          </Card>
        </div>

        <div className="lg:col-span-4">
          <Card title="Contract" kicker="02 · on tempo">
            <Row
              k="Settlement"
              v={
                <a className="underline decoration-dotted" href={tempoAddress(hp.TEMPO.settlement)} target="_blank" rel="noreferrer">
                  {short(hp.TEMPO.settlement)}
                </a>
              }
            />
            <Row k="Signatures required" v={c ? `${c.threshold} of ${c.attesters.length} attesters` : <Skel />} strong />
            <Row k="Max per payout" v={c?.maxPerSettlement ? usd(c.maxPerSettlement) : <Skel />} />
            <Row k="24h limit" v={c?.dailyLimit ? `${usd(c.windowSpent ?? 0)} of ${usd(c.dailyLimit)}` : <Skel />} />
            <Row k="Settlement liquidity" v={c?.pool != null ? `${usd(c.pool)} ${hp.TEMPO.token}` : <Skel />} />
            <Row
              k="Status"
              v={c ? <span className={c.paused ? "text-vermilion" : "text-mint"}>{c.paused ? "paused" : "live"}</span> : <Skel />}
            />
            <div className="dash mt-3 pt-2">
              <p className="num mb-1 text-[10px] uppercase tracking-[0.2em] text-ink-soft">Attesters</p>
              {c ? (
                c.attesters.map((a) => (
                  <a key={a} className="num block text-xs underline decoration-dotted" href={tempoAddress(a)} target="_blank" rel="noreferrer">
                    {a}
                  </a>
                ))
              ) : (
                <Skel className="w-48" />
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-4">
          <Card title="How a payout is approved" kicker="03 · trust model">
            <ol className="list-decimal space-y-2 pl-4 text-sm text-ink-soft">
              <li>
                The shopper&apos;s Solana checkout pays the Tempo bridge and commits the merchant&apos;s Tempo address in a
                memo, in the same transaction.
              </li>
              <li>
                Each attester reads that transaction through its own Solana RPC and signs the exact payout (EIP-712):
                checkout, merchant, token, amount.
              </li>
              <li>
                The contract pays only with {c?.threshold ?? 2} valid attester signatures, once per checkout, under a
                per-payout and a rolling 24-hour cap. Anyone can submit; a guardian can pause.
              </li>
              <li>This page re-checks every payout against Solana, independently of all of the above.</li>
            </ol>
          </Card>
        </div>

        <div className="lg:col-span-12">
          <Card title="Payouts" kicker="04 · every settlement">
            {!audit ? (
              <p className="animate-pulse py-8 text-center text-sm text-ink-soft">{error ? "Audit unavailable." : "Reconciling payouts…"}</p>
            ) : audit.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-soft">No Tempo payouts yet.</p>
            ) : (
              <div className="divide-y divide-dashed divide-rule">
                {audit.rows.map((r) => (
                  <div key={r.hash} className="flex flex-wrap items-center gap-x-5 gap-y-1 py-2.5 text-sm">
                    <span className="num w-28 text-xs text-ink-soft">{when(r.at)}</span>
                    <span className="num w-24 text-right font-medium">{usd(r.amount)}</span>
                    <span className="num w-28 text-xs">to {short(r.merchant)}</span>
                    <span className={`num border px-1.5 py-0.5 text-[10px] uppercase tracking-widest ${STATUS[r.status].cls}`}>
                      {STATUS[r.status].label}
                    </span>
                    <span className="num flex gap-3 text-xs">
                      <a className="underline decoration-dotted" href={hp.tempoExplorerTx(r.hash)} target="_blank" rel="noreferrer">
                        Tempo tx
                      </a>
                      {r.solanaSig && (
                        <a className="underline decoration-dotted" href={hp.explorerTx(r.solanaSig)} target="_blank" rel="noreferrer">
                          Solana checkout
                        </a>
                      )}
                    </span>
                    <span className="min-w-60 flex-1 text-[11px] text-ink-soft">
                      {r.detail}
                      {r.contract !== hp.TEMPO.settlement ? " · legacy contract" : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
}
