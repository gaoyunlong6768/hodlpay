export type AssetId = "SOL" | "zenZEC";
export type Rail = "solana" | "tempo";

export interface AssetConfig {
  id: AssetId;
  label: string;
  chain: string;
  decimals: number;
  /** Max loan-to-value when opening new credit. */
  maxLtv: number;
  /** LTV at which a margin alert is sent. */
  marginLtv: number;
  /** LTV at which the position becomes liquidatable. */
  liquidationLtv: number;
}

export const ASSETS: Record<AssetId, AssetConfig> = {
  SOL: {
    id: "SOL",
    label: "Solana",
    chain: "Solana",
    decimals: 9,
    maxLtv: 0.5,
    marginLtv: 0.65,
    liquidationLtv: 0.75,
  },
  zenZEC: {
    id: "zenZEC",
    label: "Zcash (zenZEC)",
    chain: "Zcash → Solana",
    decimals: 8,
    maxLtv: 0.4,
    marginLtv: 0.55,
    liquidationLtv: 0.65,
  },
};

export const PROTOCOL = {
  merchantFeeBps: 150,
  installments: 4,
  installmentIntervalDays: 14,
  graceDays: 3,
  liquidationBonus: 0.05,
  /** On-time repayment ladder, as enforced by the program (`CREDIT_*` constants). */
  credit: { stepUsd: 250, stepLtv: 0.025, maxLevel: 4, marginBuffer: 0.05, windowDays: 7 },
};

export interface CreditRecord {
  /** Cash repaid on time since the last reset, excluding installments due at checkout. */
  onTimeRepaid: number;
  onTimeInstallments: number;
  resets: number;
}

export const NO_CREDIT: CreditRecord = { onTimeRepaid: 0, onTimeInstallments: 0, resets: 0 };

export function creditLevel(c: CreditRecord): number {
  return Math.min(PROTOCOL.credit.maxLevel, Math.floor(c.onTimeRepaid / PROTOCOL.credit.stepUsd + 1e-9));
}

/** Max LTV for new credit: the asset's base, raised by the credit level, kept below its margin line. */
export function maxLtvFor(id: AssetId, c: CreditRecord): number {
  const a = ASSETS[id];
  const boosted = a.maxLtv + creditLevel(c) * PROTOCOL.credit.stepLtv;
  return Math.max(a.maxLtv, Math.min(boosted, a.marginLtv - PROTOCOL.credit.marginBuffer));
}

export interface Installment {
  index: number;
  dueAt: number;
  amount: number;
  paidAt: number | null;
  /** Set when the installment was left unpaid and collected from collateral (on-chain mode). */
  collected?: { paid: number; lateFee: number; seized: number; asset: AssetId; sig: string; at: number };
}

export interface Loan {
  id: string;
  merchant: string;
  item: string;
  rail: Rail;
  principal: number;
  merchantReceived: number;
  createdAt: number;
  installments: Installment[];
}

export type EventKind =
  | "deposit"
  | "withdraw"
  | "checkout"
  | "repay"
  | "price"
  | "margin"
  | "liquidation"
  | "time";

export interface LedgerEvent {
  id: string;
  at: number;
  kind: EventKind;
  message: string;
  /** On-chain transaction signature, when the event came from a real transaction. */
  sig?: string;
}

export interface State {
  now: number;
  prices: Record<AssetId, number>;
  collateral: Record<AssetId, number>;
  loans: Loan[];
  events: LedgerEvent[];
  marginAlerted: boolean;
  credit: CreditRecord;
}

export type Status = "empty" | "healthy" | "margin" | "liquidatable";

export interface Metrics {
  collateralValue: number;
  borrowLimit: number;
  marginLimit: number;
  liquidationLimit: number;
  debt: number;
  available: number;
  ltv: number;
  /** Weighted max LTV across current collateral. */
  blendedMaxLtv: number;
  status: Status;
  /** Price drop (0..1) that would trigger liquidation. */
  dropToLiquidation: number;
}

const DAY = 24 * 60 * 60 * 1000;

let counter = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export function initialState(prices: Record<AssetId, number>): State {
  return {
    now: Date.now(),
    prices,
    collateral: { SOL: 0, zenZEC: 0 },
    loans: [],
    events: [],
    marginAlerted: false,
    credit: NO_CREDIT,
  };
}

export function outstanding(loan: Loan): number {
  return loan.installments.filter((i) => i.paidAt === null).reduce((s, i) => s + i.amount, 0);
}

/** `debtOverride` lets on-chain mode use the program's debt, which already nets out liquidations. */
export function metrics(s: State, debtOverride?: number): Metrics {
  let collateralValue = 0;
  let borrowLimit = 0;
  let marginLimit = 0;
  let liquidationLimit = 0;
  for (const id of Object.keys(ASSETS) as AssetId[]) {
    const v = s.collateral[id] * s.prices[id];
    collateralValue += v;
    borrowLimit += v * maxLtvFor(id, s.credit);
    marginLimit += v * ASSETS[id].marginLtv;
    liquidationLimit += v * ASSETS[id].liquidationLtv;
  }
  const debt = debtOverride ?? s.loans.reduce((sum, l) => sum + outstanding(l), 0);
  const ltv = collateralValue > 0 ? debt / collateralValue : 0;
  let status: Status = "healthy";
  if (collateralValue === 0 && debt === 0) status = "empty";
  else if (debt > liquidationLimit) status = "liquidatable";
  else if (debt > marginLimit) status = "margin";
  return {
    collateralValue,
    borrowLimit,
    marginLimit,
    liquidationLimit,
    debt,
    available: Math.max(0, borrowLimit - debt),
    ltv,
    blendedMaxLtv: collateralValue > 0 ? borrowLimit / collateralValue : 0,
    status,
    dropToLiquidation: liquidationLimit > 0 ? Math.max(0, 1 - debt / liquidationLimit) : 1,
  };
}

function log(s: State, kind: EventKind, message: string): State {
  return {
    ...s,
    events: [{ id: uid("ev"), at: s.now, kind, message }, ...s.events].slice(0, 60),
  };
}

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function deposit(s: State, asset: AssetId, amount: number): State {
  if (!(amount > 0)) throw new Error("Amount must be positive");
  const next = { ...s, collateral: { ...s.collateral, [asset]: s.collateral[asset] + amount } };
  return checkMargin(log(next, "deposit", `Locked ${amount} ${asset} as collateral`));
}

export function withdraw(s: State, asset: AssetId, amount: number): State {
  if (!(amount > 0)) throw new Error("Amount must be positive");
  if (amount > s.collateral[asset]) throw new Error(`Only ${s.collateral[asset]} ${asset} locked`);
  const next = { ...s, collateral: { ...s.collateral, [asset]: s.collateral[asset] - amount } };
  const m = metrics(next);
  if (m.debt > m.borrowLimit + 1e-9) throw new Error("Withdrawal would exceed your max LTV");
  return log(next, "withdraw", `Unlocked ${amount} ${asset}`);
}

export function checkout(
  s: State,
  input: { merchant: string; item: string; price: number; rail: Rail },
): State {
  const m = metrics(s);
  if (!(input.price > 0)) throw new Error("Price must be positive");
  if (input.price > m.available + 1e-9) {
    throw new Error(`Not enough credit: ${usd(m.available)} available`);
  }
  const fee = (input.price * PROTOCOL.merchantFeeBps) / 10_000;
  const per = Math.round((input.price / PROTOCOL.installments) * 100) / 100;
  const installments: Installment[] = Array.from({ length: PROTOCOL.installments }, (_, i) => ({
    index: i,
    dueAt: s.now + i * PROTOCOL.installmentIntervalDays * DAY,
    amount:
      i === PROTOCOL.installments - 1
        ? Math.round((input.price - per * (PROTOCOL.installments - 1)) * 100) / 100
        : per,
    paidAt: i === 0 ? s.now : null,
  }));
  const loan: Loan = {
    id: uid("loan"),
    merchant: input.merchant,
    item: input.item,
    rail: input.rail,
    principal: input.price,
    merchantReceived: input.price - fee,
    createdAt: s.now,
    installments,
  };
  const settled = input.rail === "solana" ? "USDC on Solana" : "stablecoin on Tempo";
  return log(
    { ...s, loans: [loan, ...s.loans] },
    "checkout",
    `Paid ${input.merchant} ${usd(loan.merchantReceived)} in ${settled} for ${input.item}; you paid ${usd(per)} today, 3 × ${usd(per)} to go`,
  );
}

export function repayNext(s: State, loanId: string): State {
  const loan = s.loans.find((l) => l.id === loanId);
  if (!loan) throw new Error("Loan not found");
  const next = loan.installments.find((i) => i.paidAt === null);
  if (!next) throw new Error("Loan already repaid");
  const loans = s.loans.map((l) =>
    l.id !== loanId
      ? l
      : {
          ...l,
          installments: l.installments.map((i) =>
            i.index === next.index ? { ...i, paidAt: s.now } : i,
          ),
        },
  );
  const late = s.now > next.dueAt + PROTOCOL.graceDays * DAY;
  const credit = late
    ? { ...s.credit, onTimeRepaid: 0, resets: s.credit.resets + 1 }
    : next.index > 0 && s.now >= creditWindowOpens(next)
      ? { ...s.credit, onTimeRepaid: s.credit.onTimeRepaid + next.amount, onTimeInstallments: s.credit.onTimeInstallments + 1 }
      : s.credit;
  let out = log({ ...s, loans, credit }, "repay", `Repaid installment ${next.index + 1}/4 (${usd(next.amount)}) to ${loan.merchant} loan`);
  const note = creditChange(s.credit, credit) ?? (late ? null : earlyNote(next, s.now));
  if (note) out = log(out, "repay", note);
  return checkMargin(out);
}

/** When paying `i` starts to build credit: `CREDIT_WINDOW` before its due date. */
export function creditWindowOpens(i: Installment): number {
  return i.dueAt - PROTOCOL.credit.windowDays * DAY;
}

/** Ledger line for an installment prepaid before its credit window, if it was. */
export function earlyNote(i: Installment, now: number): string | null {
  if (i.index === 0 || now >= creditWindowOpens(i)) return null;
  const day = new Date(creditWindowOpens(i)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Paid early, so no credit for it: only payments in the ${PROTOCOL.credit.windowDays} days before a due date count (this one from ${day})`;
}

/** Ledger line for a credit level change, if any. */
export function creditChange(before: CreditRecord, after: CreditRecord): string | null {
  const [a, b] = [creditLevel(before), creditLevel(after)];
  const pts = (l: number) => `${((l * PROTOCOL.credit.stepLtv) * 100).toFixed(1)} pts`;
  if (b > a) return `Credit level ${b} of ${PROTOCOL.credit.maxLevel}: paying on time raised your max LTV by ${pts(b)}`;
  if (after.resets > before.resets && a > 0) return `Credit level reset to 0: a late payment removed your +${pts(a)} max LTV`;
  return null;
}

export function setPrice(s: State, asset: AssetId, price: number): State {
  const next = { ...s, prices: { ...s.prices, [asset]: price } };
  return checkMargin(next);
}

function checkMargin(s: State): State {
  const m = metrics(s);
  if (m.status === "margin" && !s.marginAlerted) {
    return log(
      { ...s, marginAlerted: true },
      "margin",
      `Margin alert: LTV ${(m.ltv * 100).toFixed(1)}%. Top up collateral or repay ${usd(m.debt - m.borrowLimit)} to get back to safe.`,
    );
  }
  if (m.status === "healthy" && s.marginAlerted) return { ...s, marginAlerted: false };
  return s;
}

/**
 * Partial liquidation: repay just enough debt, seizing collateral plus a bonus,
 * to bring the position back to its blended max LTV.
 */
export function liquidate(s: State): State {
  const m = metrics({ ...s, credit: NO_CREDIT });
  if (m.status !== "liquidatable") throw new Error("Position is not liquidatable");
  const b = PROTOCOL.liquidationBonus;
  const mx = m.blendedMaxLtv;
  let repay = (m.debt - mx * m.collateralValue) / (1 - mx * (1 + b));
  repay = Math.min(m.debt, Math.max(0, repay));
  const seizeValue = Math.min(m.collateralValue, repay * (1 + b));
  const share = seizeValue / m.collateralValue;

  const collateral = { ...s.collateral };
  const seized: string[] = [];
  for (const id of Object.keys(ASSETS) as AssetId[]) {
    const amt = collateral[id] * share;
    if (amt > 0) seized.push(`${amt.toFixed(4)} ${id}`);
    collateral[id] -= amt;
  }

  let remaining = repay;
  const loans = s.loans
    .slice()
    .sort((a, b2) => a.createdAt - b2.createdAt)
    .map((l) => ({
      ...l,
      installments: l.installments.map((i) => {
        if (i.paidAt !== null || remaining <= 1e-9) return i;
        if (remaining >= i.amount) {
          remaining -= i.amount;
          return { ...i, paidAt: s.now };
        }
        const left = i.amount - remaining;
        remaining = 0;
        return { ...i, amount: Math.round(left * 100) / 100 };
      }),
    }));
  const byId = new Map(loans.map((l) => [l.id, l]));
  const ordered = s.loans.map((l) => byId.get(l.id)!);

  const credit = { ...s.credit, onTimeRepaid: 0, resets: s.credit.resets + 1 };
  return checkMargin(
    log(
      { ...s, collateral, loans: ordered, marginAlerted: false, credit },
      "liquidation",
      `Partial liquidation: repaid ${usd(repay)} by selling ${seized.join(" + ")}. Position restored to ${(mx * 100).toFixed(0)}% LTV.`,
    ),
  );
}

export function advanceDays(s: State, days: number): State {
  return log({ ...s, now: s.now + days * DAY }, "time", `Fast-forward ${days} days`);
}
