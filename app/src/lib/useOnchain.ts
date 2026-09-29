"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import * as hp from "@/lib/hodlpay";
import type { AssetId, Installment, LedgerEvent, Loan, Rail, State, EventKind } from "@/lib/engine";
import { usd } from "@/lib/engine";

export const MERCHANTS: Record<string, PublicKey> = {
  "Nomad Air": new PublicKey("DTs2qmbnMFp1aiokJi8pR7fFSpMQFBTJvK71x2kCiVm9"),
  "Kinfolk Studio": new PublicKey("2N2AHy9DVzvNmWGP1H78DMRtFzLtFtnmyUkjjaqYQDnE"),
  Bluebottle: new PublicKey("72TGq9riSzsGkfiBP1Yutt3Cs6L9bmuAYjsSB2XBTpfQ"),
};

export const CATALOG = [
  { merchant: "Nomad Air", item: "SFO → Tokyo, one way", price: 860 },
  { merchant: "Kinfolk Studio", item: "Walnut desk", price: 1240 },
  { merchant: "Bluebottle", item: "Coffee subscription, 1 yr", price: 312 },
];

type LoanMeta = { merchant: string; item: string; rail: Rail; tempoSig?: string; tempoTx?: string };

interface Collection {
  owner: string;
  loan: string;
  installment: number;
  sig?: string;
  paid?: number;
  lateFee?: number;
  seized?: number;
  asset?: AssetId;
  error?: string;
}

export interface PendingTempo {
  loan: string;
  merchant: string;
  item: string;
}

export interface CheckoutInput {
  merchant: string;
  item: string;
  price: number;
  rail: Rail;
  /** Solana payout wallet; defaults to the demo merchant with this name. */
  payTo?: string;
  /** Tempo payout address for the Tempo rail; defaults to the demo merchant with this name. */
  tempoPayTo?: string;
}

export interface CheckoutResult extends CheckoutInput {
  sig: string;
  loan: string;
  merchantReceived: number;
  /** The first installment was paid in the checkout transaction. */
  firstPaid: boolean;
  tempoHash?: string;
}

export interface Balances {
  SOL: number;
  zenZEC: number;
  USDC: number;
}

export interface OnchainView {
  state: State;
  debt: number;
  creditBalance: number;
  balances: Balances;
  priceAge: number;
  pool: hp.PoolStats;
  lpShares: number;
  lateFeeBps: number;
  gracePeriodDays: number;
  /** Tempo-rail checkouts financed on Solana whose Tempo payout has not gone through yet. */
  tempoPending: PendingTempo[];
}

/** A stress test moves the shared demo oracle, so it lapses on its own. */
export const SHOCK_TTL_MS = 3 * 60_000;

const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));

function errorMessage(e: unknown): string {
  const err = e as { message?: string; logs?: string[]; transactionLogs?: string[] };
  const msg = err?.message ?? String(e);
  const anchor = msg.match(/Error Message: ([^.]+)/);
  if (anchor) return anchor[1];
  const logs = err.logs ?? err.transactionLogs ?? [];
  const logMsg = logs.map((l) => l.match(/Error Message: ([^.]+)/)?.[1]).find(Boolean);
  if (logMsg) return logMsg;
  if (/insufficient (funds|lamports)/i.test(msg) || logs.some((l) => /insufficient/i.test(l))) {
    return "Insufficient wallet balance. Use the faucet to get test funds.";
  }
  if (/User rejected/i.test(msg)) return "Transaction cancelled in wallet.";
  return msg.length > 160 ? `${msg.slice(0, 160)}…` : msg;
}

export function useOnchain() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const owner = publicKey?.toBase58() ?? null;
  const program = useMemo(() => (wallet ? hp.program(wallet, connection) : null), [wallet, connection]);

  const [view, setView] = useState<OnchainView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckout, setLastCheckout] = useState<CheckoutResult | null>(null);
  const [stress, setStress] = useState<{ shock: number; until: number } | null>(null);
  const stressRef = useRef(stress);
  useEffect(() => {
    stressRef.current = stress;
  }, [stress]);

  const genesisKey = `hodlpay.genesis.${connection.rpcEndpoint}`;
  const [genesis, setGenesis] = useState<string | null>(() => load<string | null>(genesisKey, null));
  useEffect(() => {
    connection
      .getGenesisHash()
      .then((g) => {
        setGenesis(g.slice(0, 8));
        save(genesisKey, g.slice(0, 8));
      })
      .catch(() => setGenesis((cached) => cached ?? hp.DEPLOYMENT.cluster));
  }, [connection, genesisKey]);
  const scope = owner && genesis ? `hodlpay.${genesis}` : "";
  const eventsKey = scope ? `${scope}.events.${owner}` : "";
  const metaKey = scope ? `${scope}.loans.${owner}` : "";

  const log = useCallback(
    (kind: EventKind, message: string, sig?: string) => {
      if (!eventsKey) return;
      const ev: LedgerEvent = { id: sig ?? `${Date.now()}`, at: Date.now(), kind, message, sig };
      save(eventsKey, [ev, ...load<LedgerEvent[]>(eventsKey, [])].slice(0, 60));
    },
    [eventsKey],
  );

  const refreshId = useRef(0);
  const loaded = useRef(false);
  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    if (!program || !publicKey || !scope) {
      loaded.current = false;
      setView(null);
      return;
    }
    const [assets, cfg, pos, lamports, usdc, zec, pool, lp] = await Promise.all([
      hp.fetchAssets(program),
      hp.fetchConfig(program),
      hp.fetchPosition(program, publicKey),
      connection.getBalance(publicKey),
      connection.getTokenAccountBalance(hp.ata(hp.USDC_MINT, publicKey)).catch(() => null),
      connection.getTokenAccountBalance(hp.ata(hp.ZEC_MINT, publicKey)).catch(() => null),
      hp.fetchPool(program),
      connection.getTokenAccountBalance(hp.ata(hp.pdas.lpMint(), publicKey)).catch(() => null),
    ]);
    const chainLoans = await hp.fetchLoans(program, publicKey, pos.loanCount);
    const meta = load<Record<string, LoanMeta>>(metaKey, {});

    const loans: Loan[] = chainLoans
      .map((l) => {
        const m = meta[l.address];
        const installments: Installment[] = Array.from({ length: l.installmentsTotal }, (_, i) => ({
          index: i,
          dueAt: (l.createdAt + i * cfg.installmentInterval) * 1000,
          amount: i === l.installmentsTotal - 1 ? l.principal - l.installmentAmount * (l.installmentsTotal - 1) : l.installmentAmount,
          paidAt: i < l.installmentsPaid ? l.createdAt * 1000 : null,
        }));
        return {
          id: l.address,
          merchant: m?.merchant ?? `${l.merchant.slice(0, 4)}…${l.merchant.slice(-4)}`,
          item: m?.item ?? `Loan #${l.index + 1}`,
          rail: m?.rail ?? "solana",
          principal: l.principal,
          merchantReceived: l.merchantReceived,
          createdAt: l.createdAt * 1000,
          installments,
        };
      })
      .reverse();

    if (id !== refreshId.current) return;
    if (!loaded.current) {
      loaded.current = true;
      setError((e) => (e?.startsWith("Could not read your position") ? null : e));
    }
    setView({
      state: {
        now: Date.now(),
        prices: { SOL: assets.SOL.price, zenZEC: assets.zenZEC.price },
        collateral: pos.collateral,
        loans,
        events: load<LedgerEvent[]>(eventsKey, []),
        marginAlerted: false,
      },
      debt: pos.debt,
      creditBalance: pos.creditBalance,
      balances: {
        SOL: lamports / LAMPORTS_PER_SOL,
        USDC: Number(usdc?.value.uiAmount ?? 0),
        zenZEC: Number(zec?.value.uiAmount ?? 0),
      },
      priceAge: Math.round(Date.now() / 1000 - Math.min(assets.SOL.updatedAt, assets.zenZEC.updatedAt)),
      pool,
      lpShares: Number(lp?.value.uiAmount ?? 0),
      lateFeeBps: cfg.lateFeeBps,
      gracePeriodDays: cfg.gracePeriod / 86_400,
      tempoPending: Object.entries(meta)
        .filter(([, m]) => m.rail === "tempo" && m.tempoSig && !m.tempoTx)
        .map(([loan, m]) => ({ loan, merchant: m.merchant, item: m.item })),
    });
  }, [program, publicKey, connection, metaKey, eventsKey, scope]);

  const keeper = useCallback(
    async (opts: { liquidate?: boolean; force?: boolean } = {}) => {
      let s = stressRef.current;
      if (s && Date.now() > s.until) {
        s = null;
        setStress(null);
        opts = { ...opts, force: true };
      }
      const res = await fetch("/api/keeper", {
        method: "POST",
        body: JSON.stringify({ ...opts, force: opts.force || !!s, owner, shock: s?.shock ?? 0 }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "keeper failed");
      const r = body as {
        posted: { sig: string } | null;
        collections: Collection[];
        liquidations: { owner: string; sig?: string; repaid?: number; asset?: AssetId; error?: string }[];
      };
      const meta = load<Record<string, LoanMeta>>(metaKey, {});
      for (const c of r.collections ?? []) {
        if (c.owner !== owner || !c.sig) continue;
        const item = meta[c.loan]?.item ?? "a purchase";
        log(
          "liquidation",
          `Installment #${c.installment} of ${item} was overdue: the keeper paid ${usd(c.paid ?? 0)} + ${usd(c.lateFee ?? 0)} late fee from your collateral (${(c.seized ?? 0).toFixed(4)} ${c.asset}, incl. 5% bonus)`,
          c.sig,
        );
      }
      return r;
    },
    [owner, metaKey, log],
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!owner) {
      loaded.current = false;
      setView(null);
      setLastCheckout(null);
      setError(null);
      return;
    }
    const load = () =>
      refresh().catch((e) => {
        if (!loaded.current) setError(`Could not read your position from Solana ${hp.DEPLOYMENT.cluster}, retrying. ${errorMessage(e)}`);
      });
    const tick = () => keeper().then(refresh).catch(load);
    load();
    /* eslint-enable react-hooks/set-state-in-effect */
    tick();
    const t = setInterval(tick, 20_000);
    return () => clearInterval(t);
  }, [owner, keeper, refresh]);

  const inFlight = useRef(false);
  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(label);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        inFlight.current = false;
        setBusy(null);
        refresh().catch(() => {});
      }
    },
    [refresh],
  );

  const send = useCallback(
    async (ixs: TransactionInstruction[]) => {
      if (!program) throw new Error("Connect a wallet first");
      return program.provider.sendAndConfirm!(hp.tx(...ixs), [], { commitment: "confirmed" });
    },
    [program],
  );

  /** Relays a Tempo-rail checkout; safe to repeat, the settlement contract pays each checkout once. */
  const settleTempo = useCallback(
    async (loanAddress: string) => {
      const meta = load<Record<string, LoanMeta>>(metaKey, {});
      const m = meta[loanAddress];
      if (!m?.tempoSig) throw new Error("No Tempo checkout recorded for this loan");
      const res = await fetch("/api/tempo/settle", { method: "POST", body: JSON.stringify({ sig: m.tempoSig }) });
      const body = await res.json();
      if (!res.ok) throw new Error(`Financed on Solana, but the Tempo payout did not go through: ${body.error}`);
      m.tempoTx = body.hash;
      save(metaKey, meta);
      log("checkout", `Relayed ${usd(body.amount)} to ${m.merchant} on Tempo (${body.token})`, body.hash);
      return body.hash as string;
    },
    [metaKey, log],
  );

  const ensureFreshPrices = useCallback(async () => {
    if (view && view.priceAge > 45) await keeper({ force: true });
  }, [view, keeper]);

  const actions = {
    faucet: () =>
      run("faucet", async () => {
        const res = await fetch("/api/faucet", { method: "POST", body: JSON.stringify({ wallet: owner }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        log("deposit", `Faucet sent ${body.sent.usdc} test USDC + ${body.sent.zec} test zenZEC to your wallet`, body.sig);
      }),

    deposit: (asset: AssetId, amount: number) =>
      run("deposit", async () => {
        if (!(amount > 0)) throw new Error("Amount must be positive");
        const have = view?.balances[asset];
        if (have !== undefined && amount > have + 1e-9) {
          const shown = have.toLocaleString("en-US", { maximumFractionDigits: 4 });
          throw new Error(`Your wallet holds ${shown} ${asset}. Lock less, or press Get test funds.`);
        }
        const { exists } = await hp.fetchPosition(program!, publicKey!);
        const sig = await send(await hp.buildDeposit(program!, publicKey!, asset, amount, exists));
        log("deposit", `Locked ${amount} ${asset} in the HodlPay vault`, sig);
      }),

    withdraw: (asset: AssetId, amount: number) =>
      run("withdraw", async () => {
        if (!(amount > 0)) throw new Error("Amount must be positive");
        await ensureFreshPrices();
        const sig = await send(await hp.buildWithdraw(program!, publicKey!, asset, amount));
        log("withdraw", `Unlocked ${amount} ${asset} back to your wallet`, sig);
      }),

    checkout: (input: CheckoutInput) =>
      run("checkout", async () => {
        setLastCheckout(null);
        await ensureFreshPrices();
        const pos = await hp.fetchPosition(program!, publicKey!);
        const tempo = input.rail === "tempo";
        if (tempo && !hp.DEPLOYMENT.tempoBridge) throw new Error("Tempo rail is not configured on this deployment");
        const tempoPayTo = input.tempoPayTo ?? hp.TEMPO.merchants[input.merchant];
        if (tempo && !tempoPayTo) throw new Error("Merchant has no Tempo payout address");
        const solanaPayTo = input.payTo ? new PublicKey(input.payTo) : MERCHANTS[input.merchant];
        if (!tempo && !solanaPayTo) throw new Error("Merchant has no Solana payout wallet");
        const payee = tempo ? new PublicKey(hp.DEPLOYMENT.tempoBridge!) : solanaPayTo;
        const ixs = await hp.buildCheckout(program!, publicKey!, payee, input.price, pos.loanCount);
        const cash = await connection
          .getTokenAccountBalance(hp.ata(hp.USDC_MINT, publicKey!))
          .then((b) => Number(b.value.uiAmount ?? 0))
          .catch(() => 0);
        const firstPaid = cash + pos.creditBalance >= input.price / 4;
        if (firstPaid) ixs.push(...(await hp.buildRepay(program!, publicKey!, pos.loanCount)));
        if (tempo) ixs.push(hp.buildTempoMemo(tempoPayTo));
        const sig = await send(ixs);
        const position = hp.pdas.position(publicKey!);
        const address = hp.pdas.loan(position, pos.loanCount).toBase58();
        const meta = load<Record<string, LoanMeta>>(metaKey, {});
        meta[address] = { merchant: input.merchant, item: input.item, rail: input.rail, ...(tempo ? { tempoSig: sig } : {}) };
        save(metaKey, meta);
        const net = (await program!.account.loan.fetch(new PublicKey(address))).merchantReceived.toNumber() / 1e6;
        const result: CheckoutResult = { ...input, sig, loan: address, merchantReceived: net, firstPaid };
        const plan = firstPaid
          ? `you paid ${usd(input.price / 4)} today, 3 × ${usd(input.price / 4)} to go`
          : `4 × ${usd(input.price / 4)} scheduled, first due today`;
        log(
          "checkout",
          input.rail === "tempo"
            ? `Financed ${input.item} on Solana: ${usd(net)} USDC to the Tempo bridge; ${plan}`
            : `Paid ${input.merchant} ${usd(net)} in USDC on Solana for ${input.item}; ${plan}`,
          sig,
        );
        setLastCheckout(result);
        if (tempo) setLastCheckout({ ...result, tempoHash: await settleTempo(address) });
      }),

    retryTempo: (loanAddress: string) =>
      run("tempo", async () => {
        const hash = await settleTempo(loanAddress);
        setLastCheckout((c) => (c && c.loan === loanAddress ? { ...c, tempoHash: hash } : c));
      }),

    repay: (loanAddress: string) =>
      run("repay", async () => {
        const loan = view?.state.loans.find((l) => l.id === loanAddress);
        const chainIndex = (await hp.readonlyProgram(connection).account.loan.fetch(new PublicKey(loanAddress))).index;
        const sig = await send(await hp.buildRepay(program!, publicKey!, chainIndex));
        log("repay", `Repaid an installment on ${loan?.item ?? "loan"}`, sig);
      }),

    payOff: (loanAddress: string) =>
      run("repay", async () => {
        const loan = view?.state.loans.find((l) => l.id === loanAddress);
        const l = await hp.readonlyProgram(connection).account.loan.fetch(new PublicKey(loanAddress));
        const left = l.installmentsTotal - l.installmentsPaid;
        if (left <= 0) throw new Error("Loan is already paid off");
        const ixs = (await Promise.all(Array.from({ length: left }, () => hp.buildRepay(program!, publicKey!, l.index)))).flat();
        const sig = await send(ixs);
        log("repay", `Paid off ${loan?.item ?? "loan"} early: ${left} installments, no interest`, sig);
      }),

    lend: (amountUsd: number) =>
      run("lend", async () => {
        if (!(amountUsd > 0)) throw new Error("Amount must be positive");
        const sig = await send(await hp.buildLpDeposit(program!, publicKey!, amountUsd));
        log("deposit", `Supplied ${usd(amountUsd)} to the lending pool for LP shares`, sig);
      }),

    unlend: (amountUsd: number) =>
      run("lend", async () => {
        if (!view) return;
        const all = amountUsd / view.pool.sharePrice >= view.lpShares;
        const shares = all ? view.lpShares : amountUsd / view.pool.sharePrice;
        if (!(shares > 0)) throw new Error("You have no LP shares to redeem");
        const units = (all ? Math.round : Math.floor)(shares * 1e6) / 1e6;
        const sig = await send(await hp.buildLpWithdraw(program!, publicKey!, units));
        log("withdraw", `Redeemed ${shares.toFixed(2)} LP shares (≈ ${usd(shares * view.pool.sharePrice)})`, sig);
      }),

    shock: (shock: number) =>
      run("shock", async () => {
        const res = await fetch("/api/risk/shock", { method: "POST", body: JSON.stringify({ shock }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setStress(shock === 0 ? null : { shock, until: Date.now() + SHOCK_TTL_MS });
        log("price", `Oracle stress test: prices ${shock >= 0 ? "+" : ""}${(shock * 100).toFixed(0)}% posted on-chain`, body.sig);
      }),

    liquidate: () =>
      run("liquidate", async () => {
        const r = await keeper({ liquidate: true, force: true });
        const mine = r.liquidations.find((l) => l.owner === owner);
        if (!mine) throw new Error("Keeper found nothing to liquidate");
        if (mine.error) throw new Error(mine.error);
        log("liquidation", `Keeper repaid ${usd(mine.repaid ?? 0)} of your debt by selling ${mine.asset} collateral (+5% bonus)`, mine.sig);
      }),
  };

  return { owner, view, busy, error, setError, actions, refresh, lastCheckout, shock: stress?.shock ?? 0 };
}
