"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Card, Row, Skel } from "@/components/ui";
import * as hp from "@/lib/hodlpay";
import { PROTOCOL, usd, type Rail } from "@/lib/engine";
import { isEvm, isSolana, payPath, type PayRequest } from "@/lib/paylink";
import { CATALOG, MERCHANTS } from "@/lib/useOnchain";

interface Profile {
  name: string;
  solana: string;
  tempo: string;
}

interface Sale {
  loan: string;
  shopper: string;
  principal: number;
  received: number;
  paid: number;
  total: number;
  at: number;
}

interface TempoPayout {
  hash: string;
  amount: number;
  at: number;
  checkoutRef: string;
}

const STORE = "hodlpay.merchant.profile";
const demoProfile = (name: string): Profile => ({
  name,
  solana: MERCHANTS[name]?.toBase58() ?? "",
  tempo: hp.TEMPO.merchants[name] ?? "",
});
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const when = (t: number) =>
  `${new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${new Date(t).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;

export default function MerchantPortal() {
  const [profile, setProfile] = useState<Profile>(() => demoProfile("Kinfolk Studio"));
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setProfile(JSON.parse(saved));
    } catch {}
  }, []);
  const update = (p: Profile) => {
    setProfile(p);
    localStorage.setItem(STORE, JSON.stringify(p));
  };

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-24">
      <div className="mb-8 max-w-3xl">
        <p className="num mb-3 text-xs uppercase tracking-[0.25em] text-ink-soft">HodlPay for merchants</p>
        <h1 className="font-display text-5xl leading-[0.95] md:text-6xl">
          Get paid in full today. <span className="italic text-mint">Let crypto holders pay in 4.</span>
        </h1>
        <p className="mt-4 text-lg text-ink-soft">
          Share a payment link. Shoppers pay with a credit line backed by the SOL or zenZEC they keep; you receive the
          full amount minus a {PROTOCOL.merchantFeeBps / 100}% fee, instantly, in USDC on Solana
          or in stablecoins on Tempo. No crypto price risk, no chargebacks, no repayment risk.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <ProfileCard profile={profile} onChange={update} />
        </div>
        <div className="lg:col-span-8">
          <LinkBuilder profile={profile} />
        </div>
        <div className="lg:col-span-12">
          <Sales profile={profile} />
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  valid = true,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  valid?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="num mb-1 block text-[11px] uppercase tracking-widest text-ink-soft">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`num w-full border bg-transparent px-3 py-2 text-sm outline-none focus:border-ink ${
          valid ? "border-rule" : "border-vermilion"
        }`}
      />
    </label>
  );
}

function ProfileCard({ profile, onChange }: { profile: Profile; onChange: (p: Profile) => void }) {
  return (
    <Card title="Your business" kicker="01 · payouts">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {Object.keys(MERCHANTS).map((name) => (
          <button
            key={name}
            onClick={() => onChange(demoProfile(name))}
            className={`num border px-2 py-1 text-[11px] transition ${
              profile.name === name ? "border-ink bg-ink text-paper" : "border-rule hover:border-ink"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        <Field label="Business name" value={profile.name} onChange={(name) => onChange({ ...profile, name })} />
        <Field
          label="Solana payout wallet (USDC)"
          value={profile.solana}
          valid={!profile.solana || isSolana(profile.solana)}
          placeholder="Base58 address"
          onChange={(solana) => onChange({ ...profile, solana: solana.trim() })}
        />
        <Field
          label="Tempo payout address (optional)"
          value={profile.tempo}
          valid={!profile.tempo || isEvm(profile.tempo)}
          placeholder="0x…"
          onChange={(tempo) => onChange({ ...profile, tempo: tempo.trim() })}
        />
      </div>
      <p className="num mt-3 text-[11px] text-ink-soft">Saved in this browser. Pick a demo merchant to try it.</p>
    </Card>
  );
}

function LinkBuilder({ profile }: { profile: Profile }) {
  const [item, setItem] = useState("Walnut desk");
  const [amount, setAmount] = useState("1240");
  const [shownFor, setShownFor] = useState(profile.name);
  if (shownFor !== profile.name) {
    setShownFor(profile.name);
    const demo = CATALOG.find((c) => c.merchant === profile.name);
    if (demo) {
      setItem(demo.item);
      setAmount(String(demo.price));
    }
  }
  const [rail, setRail] = useState<Rail>("solana");
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);

  const railOk = rail === "solana" ? isSolana(profile.solana) : isEvm(profile.tempo);
  const x = Number(amount);
  const valid = railOk && Number.isFinite(x) && x >= 1 && item.trim().length > 0;
  const request: PayRequest = {
    merchant: profile.name || "Merchant",
    item: item.trim(),
    amount: x,
    rail,
    to: profile.solana,
    tempo: profile.tempo,
  };
  const url = valid && origin ? `${origin}${payPath(request)}` : "";
  const snippet = url
    ? `<a href="${url}" style="display:inline-block;padding:12px 18px;background:#16140f;color:#f2ede2;font:500 14px sans-serif;text-decoration:none">Pay in 4 with HodlPay</a>`
    : "";

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#16140f", light: "#fbf8f1" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [url]);

  const copy = (label: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Card title="Payment link" kicker="02 · checkout">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-3">
          <Field label="Item" value={item} onChange={setItem} />
          <Field label="Price (USD)" value={amount} onChange={setAmount} valid={Number.isFinite(x) && x >= 1} />
          <div>
            <span className="num mb-1 block text-[11px] uppercase tracking-widest text-ink-soft">Settle to me on</span>
            <div className="grid grid-cols-2 border border-ink text-sm">
              <button onClick={() => setRail("solana")} className={`py-2 transition ${rail === "solana" ? "bg-ink text-paper" : ""}`}>
                Solana · USDC
              </button>
              <button onClick={() => setRail("tempo")} className={`py-2 transition ${rail === "tempo" ? "bg-tempo text-paper" : ""}`}>
                Tempo · {hp.TEMPO.token}
              </button>
            </div>
            {!railOk && (
              <p className="num mt-1 text-[11px] text-vermilion">
                Add a valid {rail === "solana" ? "Solana payout wallet" : "Tempo payout address"} first.
              </p>
            )}
          </div>
          {valid && (
            <div className="dash pt-2">
              <Row k="Shopper pays" v={`${usd(x / 4)} today, then 3 × ${usd(x / 4)}`} />
              <Row k="You receive now" v={usd(x * 0.97)} strong />
            </div>
          )}
        </div>
        <div className="flex w-full flex-col items-center gap-2 md:w-52">
          {url && qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Payment link QR code" className="h-48 w-48 border border-rule" />
          ) : (
            <div className="grid h-48 w-48 place-items-center border border-dashed border-rule text-xs text-ink-soft">QR code</div>
          )}
          <a
            href={url || undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!url}
            className={`w-full px-3 py-2.5 text-center text-sm font-medium text-paper transition ${
              url ? "bg-ink hover:bg-mint" : "pointer-events-none bg-ink/30"
            }`}
          >
            Open checkout
          </a>
        </div>
      </div>
      {url && (
        <div className="dash mt-4 space-y-2 pt-3">
          <div className="flex items-center gap-2">
            <code className="num min-w-0 flex-1 truncate bg-paper-2 px-2 py-1.5 text-[11px]">{url}</code>
            <button onClick={() => copy("link", url)} className="num border border-ink px-2 py-1 text-[11px]">
              {copied === "link" ? "copied" : "copy link"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="num min-w-0 flex-1 truncate bg-paper-2 px-2 py-1.5 text-[11px]">{snippet}</code>
            <button onClick={() => copy("button", snippet)} className="num border border-ink px-2 py-1 text-[11px]">
              {copied === "button" ? "copied" : "copy button"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Sales({ profile }: { profile: Profile }) {
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [payouts, setPayouts] = useState<TempoPayout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const current = () => id === requestId.current;
    setLoading(true);
    setError(null);
    try {
      const jobs: Promise<void>[] = [];
      if (isSolana(profile.solana)) {
        jobs.push(
          (async () => {
            const p = hp.readonlyProgram();
            const loans = await p.account.loan.all([{ memcmp: { offset: 8 + 32 + 32, bytes: profile.solana } }]);
            if (!current()) return;
            setSales(
              loans
                .map(({ publicKey, account: l }) => ({
                  loan: publicKey.toBase58(),
                  shopper: l.owner.toBase58(),
                  principal: hp.fromUnits(l.principal, 6),
                  received: hp.fromUnits(l.merchantReceived, 6),
                  paid: l.installmentsPaid,
                  total: l.installmentsTotal,
                  at: l.createdAt.toNumber() * 1000,
                }))
                .sort((a, b) => b.at - a.at),
            );
          })(),
        );
      } else setSales(null);
      if (isEvm(profile.tempo)) {
        jobs.push(
          (async () => {
            const res = await fetch(`/api/tempo/settlements?merchant=${profile.tempo}`);
            const body = await res.json();
            if (!res.ok) throw new Error(body.error);
            if (current()) setPayouts(body.settlements);
          })(),
        );
      } else setPayouts(null);
      await Promise.all(jobs);
    } catch (e) {
      if (current()) setError((e as Error).message);
    } finally {
      if (current()) setLoading(false);
    }
  }, [profile.solana, profile.tempo]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSales(null);
    setPayouts(null);
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  const totals = useMemo(() => {
    const s = sales ?? [];
    const t = payouts ?? [];
    const gross = s.reduce((a, x) => a + x.principal, 0);
    const received = s.reduce((a, x) => a + x.received, 0) + t.reduce((a, x) => a + x.amount, 0);
    return { orders: s.length + t.length, gross, received, fees: gross - s.reduce((a, x) => a + x.received, 0) };
  }, [sales, payouts]);
  const pending = loading && ((isSolana(profile.solana) && !sales) || (isEvm(profile.tempo) && !payouts));

  return (
    <Card title="Sales" kicker="03 · settlements">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="num grid grid-cols-2 gap-6 text-sm sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-ink-soft">Orders</p>
            <p className="font-display text-3xl">{pending ? <Skel className="w-10" /> : totals.orders}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-ink-soft">Received</p>
            <p className="font-display text-3xl">{pending ? <Skel className="w-28" /> : usd(totals.received)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-ink-soft">Fees (Solana)</p>
            <p className="font-display text-3xl">{pending ? <Skel className="w-20" /> : usd(totals.fees)}</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} className="num border border-ink px-3 py-1.5 text-xs transition hover:bg-paper-2 disabled:opacity-40">
          {loading ? "loading…" : "refresh"}
        </button>
      </div>
      {error && <p className="num mb-2 text-xs text-vermilion">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="num mb-2 text-[11px] uppercase tracking-widest text-ink-soft">Solana · USDC</p>
          {!sales ? (
            <p className="text-sm text-ink-soft">
              {loading && isSolana(profile.solana) ? "Loading…" : "Add a Solana payout wallet to see sales."}
            </p>
          ) : sales.length === 0 ? (
            <p className="text-sm text-ink-soft">No HodlPay sales yet. Open a payment link and buy something.</p>
          ) : (
            <ul className="num divide-y divide-dashed divide-rule text-xs">
              {sales.map((s) => (
                <li key={s.loan} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 sm:flex-nowrap">
                  <span className="w-24 shrink-0 text-ink-soft">{when(s.at)}</span>
                  <span className="order-last basis-full sm:order-none sm:flex-1 sm:basis-auto">
                    shopper{" "}
                    <a className="underline decoration-dotted" href={hp.explorerAddress(s.loan)} target="_blank" rel="noreferrer">
                      {short(s.shopper)}
                    </a>
                    <span className="ml-2 text-ink-soft">
                      repaid {s.paid}/{s.total}
                    </span>
                  </span>
                  <span className="ml-auto w-20 text-right sm:ml-0">{usd(s.principal)}</span>
                  <span className="w-24 text-right font-medium text-mint">+{usd(s.received)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="num mb-2 text-[11px] uppercase tracking-widest text-tempo">Tempo · {hp.TEMPO.token}</p>
          {!payouts ? (
            <p className="text-sm text-ink-soft">
              {loading && isEvm(profile.tempo) ? "Loading…" : "Add a Tempo payout address to see Tempo settlements."}
            </p>
          ) : payouts.length === 0 ? (
            <p className="text-sm text-ink-soft">No Tempo settlements yet.</p>
          ) : (
            <ul className="num divide-y divide-dashed divide-rule text-xs">
              {payouts.map((t) => (
                <li key={t.hash} className="flex items-center gap-3 py-2">
                  <span className="w-24 shrink-0 text-ink-soft">{when(t.at)}</span>
                  <a className="flex-1 underline decoration-dotted" href={hp.tempoExplorerTx(t.hash)} target="_blank" rel="noreferrer">
                    ref {t.checkoutRef.slice(0, 10)}…
                  </a>
                  <span className="w-24 text-right font-medium text-tempo">+{usd(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="num mt-4 text-[11px] text-ink-soft">
        You are paid in full at checkout. Installment and collateral risk sit with the HodlPay liquidity pool, not with you.
      </p>
    </Card>
  );
}
