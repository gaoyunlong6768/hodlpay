import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction } from "@solana/spl-token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  BN,
  MEMO_PROGRAM_ID,
  USDC_DECIMALS,
  USDC_MINT,
  ata,
  buildCheckout,
  type HodlpayProgram,
} from "@/lib/hodlpay";

/** A Solana Pay transfer request (`solana:<recipient>?amount=…&spl-token=…`) for USDC. */
export interface SolanaPayRequest {
  recipient: PublicKey;
  amount: number;
  reference: PublicKey[];
  label?: string;
  message?: string;
  memo?: string;
}

const AMOUNT = /^\d+(\.\d{1,6})?$/;

/** Parses a transfer request. Throws a shopper-readable error for anything HodlPay cannot pay. */
export function parseSolanaPay(url: string): SolanaPayRequest {
  const u = url.trim();
  if (!u.toLowerCase().startsWith("solana:")) throw new Error("Not a Solana Pay code: it should start with solana:");
  const rest = u.slice("solana:".length);
  if (/^https?(:|%3A)/i.test(rest)) {
    throw new Error("This is a Solana Pay transaction request, where the merchant builds the transaction. HodlPay pays transfer requests (the QR most point-of-sale apps show).");
  }
  const [path, query = ""] = rest.split("?", 2);
  let recipient: PublicKey;
  try {
    recipient = new PublicKey(decodeURIComponent(path));
  } catch {
    throw new Error("The recipient in this code is not a valid Solana address.");
  }
  const q = new URLSearchParams(query);
  const amount = q.get("amount");
  if (!amount) throw new Error("This code has no amount. Ask the merchant for a code with the price in it.");
  if (!AMOUNT.test(amount) || Number(amount) <= 0) throw new Error("The amount in this code is not valid.");
  const token = q.get("spl-token");
  if (token !== USDC_MINT.toBase58()) {
    throw new Error(
      token
        ? `This code asks for token ${token.slice(0, 4)}…${token.slice(-4)}. HodlPay pays in USDC (${USDC_MINT.toBase58().slice(0, 4)}…).`
        : "This code asks for SOL. HodlPay pays in USDC.",
    );
  }
  let reference: PublicKey[];
  try {
    reference = q.getAll("reference").map((r) => new PublicKey(r));
  } catch {
    throw new Error("A reference in this code is not a valid key.");
  }
  return {
    recipient,
    amount: Number(amount),
    reference,
    label: q.get("label") ?? undefined,
    message: q.get("message") ?? undefined,
    memo: q.get("memo") ?? undefined,
  };
}

export function encodeSolanaPay(r: SolanaPayRequest) {
  const q = [`amount=${r.amount}`, `spl-token=${USDC_MINT.toBase58()}`, ...r.reference.map((k) => `reference=${k.toBase58()}`)];
  if (r.label) q.push(`label=${encodeURIComponent(r.label)}`);
  if (r.message) q.push(`message=${encodeURIComponent(r.message)}`);
  if (r.memo) q.push(`memo=${encodeURIComponent(r.memo)}`);
  return `solana:${r.recipient.toBase58()}?${q.join("&")}`;
}

/**
 * Plan principal, in USDC units, whose checkout leaves exactly `amountUnits` after the fee.
 * The merchant takes no fee on a Solana Pay code, so the shopper's plan carries it.
 */
export function grossUp(amountUnits: bigint, feeBps: number): bigint {
  const [zero, one, bps] = [BigInt(0), BigInt(1), BigInt(10_000)];
  const net = (x: bigint) => x - (x * BigInt(feeBps)) / bps;
  let x = (amountUnits * bps) / BigInt(10_000 - feeBps);
  while (net(x) < amountUnits) x += one;
  while (x > zero && net(x - one) >= amountUnits) x -= one;
  return x;
}

export const planTotal = (amount: number, feeBps: number) =>
  Number(grossUp(BigInt(Math.round(amount * 1e6)), feeBps)) / 1e6;

/**
 * Pays a Solana Pay code with a HodlPay plan, in one transaction the merchant's point of sale accepts as is:
 * HodlPay finances the plan to the shopper's own USDC account, optionally takes the first installment, then
 * the last instruction is the plain USDC transfer the code asked for, with its reference keys, and the memo
 * (if any) right before it, as `@solana/pay`'s `validateTransfer` requires.
 */
export async function buildSolanaPayCheckout(
  p: HodlpayProgram,
  owner: PublicKey,
  req: SolanaPayRequest,
  loanIndex: number,
  feeBps: number,
  payFirst: boolean,
) {
  const amount = BigInt(Math.round(req.amount * 10 ** USDC_DECIMALS));
  const principal = grossUp(amount, feeBps);
  const ownerUsdc = ata(USDC_MINT, owner);
  const recipientUsdc = ata(USDC_MINT, req.recipient);
  const ixs: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(owner, recipientUsdc, req.recipient, USDC_MINT),
    ...(await buildCheckout(p, owner, owner, new BN(principal.toString()), loanIndex, payFirst)),
  ];
  if (req.memo) ixs.push(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(req.memo, "utf8") }));
  const transfer = createTransferCheckedInstruction(ownerUsdc, USDC_MINT, recipientUsdc, owner, amount, USDC_DECIMALS);
  transfer.keys.push(...req.reference.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })));
  ixs.push(transfer);
  return { ixs, principal: Number(principal) / 10 ** USDC_DECIMALS };
}
