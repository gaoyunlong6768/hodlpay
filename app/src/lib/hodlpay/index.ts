import { AnchorProvider, BN, Program, type Wallet } from "@anchor-lang/core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import deployment from "./deployment.json";
import idl from "./idl.json";
import tempo from "./tempo.json";
import type { Hodlpay } from "./types";

export type { Hodlpay };
export { BN };

export const DEPLOYMENT = deployment as {
  cluster: string;
  rpc: string;
  programId: string;
  usdcMint: string;
  zecMint: string;
  solMint: string;
  /** Solana address of the Tempo relayer; checkouts on the Tempo rail settle to it. */
  tempoBridge?: string;
};

export const PROGRAM_ID = new PublicKey(DEPLOYMENT.programId);
export const USDC_MINT = new PublicKey(DEPLOYMENT.usdcMint);
export const ZEC_MINT = new PublicKey(DEPLOYMENT.zecMint);
export const SOL_MINT = NATIVE_MINT;

export const MINTS = {
  SOL: { mint: SOL_MINT, decimals: 9 },
  zenZEC: { mint: ZEC_MINT, decimals: 8 },
} as const;
export type CollateralId = keyof typeof MINTS;

export const USDC_DECIMALS = 6;

export const PYTH_FEEDS: Record<CollateralId, string> = {
  SOL: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  zenZEC: "be9b59d178f0d6a97ab4c343bff2aa69caa1eaae3e9048a65788c529b125bb24",
};
export const PYTH_RECEIVER_ID = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");
const PYTH_PUSH_ORACLE_ID = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");

/** Pyth sponsored price feed account (shard 0), kept fresh by Pyth on devnet and mainnet. */
export function pythFeedAccount(feedHex: string) {
  const shard = Buffer.alloc(2);
  return PublicKey.findProgramAddressSync([shard, Buffer.from(feedHex, "hex")], PYTH_PUSH_ORACLE_ID)[0];
}

/** Decodes the fields HodlPay checks on-chain from a `PriceUpdateV2` account. */
export function readPythUpdate(data: Buffer) {
  const full = data[40] === 1;
  const o = full ? 41 : 42;
  return {
    full,
    feedId: data.subarray(o, o + 32).toString("hex"),
    price: Number(data.readBigInt64LE(o + 32)),
    exponent: data.readInt32LE(o + 48),
    publishTime: Number(data.readBigInt64LE(o + 52)),
  };
}

const seed = (s: string) => Buffer.from(s);
const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];

export const pdas = {
  config: () => pda([seed("config")]),
  liquidity: () => pda([seed("liquidity")]),
  lpMint: () => pda([seed("lp_mint")]),
  asset: (mint: PublicKey) => pda([seed("asset"), mint.toBuffer()]),
  collateralVault: (mint: PublicKey) => pda([seed("collateral_vault"), mint.toBuffer()]),
  position: (owner: PublicKey) => pda([seed("position"), owner.toBuffer()]),
  loan: (position: PublicKey, index: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(index);
    return pda([seed("loan"), position.toBuffer(), b]);
  },
};

export const ata = (mint: PublicKey, owner: PublicKey) =>
  getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

/** Server code can use a private RPC (`SOLANA_RPC`, never sent to the browser); browsers use the public one. */
export function connection() {
  return new Connection(process.env.SOLANA_RPC || DEPLOYMENT.rpc, "confirmed");
}

export type SignerWallet = Pick<Wallet, "publicKey" | "signTransaction" | "signAllTransactions">;

export function program(wallet: SignerWallet, conn = connection()) {
  const provider = new AnchorProvider(conn, wallet as Wallet, { commitment: "confirmed" });
  return new Program<Hodlpay>(idl as Hodlpay, provider);
}

/** Read-only program for fetching accounts without a wallet. */
export function readonlyProgram(conn = connection()) {
  const dummy = {
    publicKey: PublicKey.default,
    signTransaction: async <T>(t: T) => t,
    signAllTransactions: async <T>(t: T) => t,
  } as unknown as Wallet;
  return program(dummy, conn);
}

export type HodlpayProgram = Program<Hodlpay>;

export const toUnits = (amount: number, decimals: number) =>
  new BN(Math.round(amount * 10 ** decimals).toString());
export const fromUnits = (v: BN | bigint | number, decimals: number) =>
  Number(v.toString()) / 10 ** decimals;

export const assetMetas = () =>
  Object.values(MINTS).map(({ mint }) => ({
    pubkey: pdas.asset(mint),
    isSigner: false,
    isWritable: false,
  }));

const explorerSuffix = () =>
  DEPLOYMENT.cluster === "localnet"
    ? `?cluster=custom&customUrl=${encodeURIComponent(DEPLOYMENT.rpc)}`
    : `?cluster=${DEPLOYMENT.cluster}`;

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${explorerSuffix()}`;
export const explorerAddress = (addr: string) => `https://explorer.solana.com/address/${addr}${explorerSuffix()}`;
export const tempoExplorerTx = (hash: string) => `${tempo.explorer}/tx/${hash}`;
export const TEMPO = {
  explorer: tempo.explorer,
  settlement: tempo.settlement,
  token: tempo.tokenSymbol,
  merchants: tempo.merchants as Record<string, string>,
};

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const TEMPO_MEMO_PREFIX = "hodlpay:tempo:";

/** Commits the merchant's Tempo payout address inside the Solana checkout transaction. */
export const buildTempoMemo = (evmAddress: string) =>
  new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(`${TEMPO_MEMO_PREFIX}${evmAddress}`),
  });

export async function buildOpenPosition(p: HodlpayProgram, owner: PublicKey) {
  return p.methods
    .openPosition()
    .accountsPartial({ owner, position: pdas.position(owner), systemProgram: SystemProgram.programId })
    .instruction();
}

/** Deposit collateral. SOL is wrapped into wSOL in the same transaction. */
export async function buildDeposit(
  p: HodlpayProgram,
  owner: PublicKey,
  asset: CollateralId,
  amount: number,
  hasPosition: boolean,
) {
  const { mint, decimals } = MINTS[asset];
  const units = toUnits(amount, decimals);
  const userToken = ata(mint, owner);
  const ixs: TransactionInstruction[] = [];
  if (!hasPosition) ixs.push(await buildOpenPosition(p, owner));
  if (asset === "SOL") {
    ixs.push(
      createAssociatedTokenAccountIdempotentInstruction(owner, userToken, owner, mint),
      SystemProgram.transfer({ fromPubkey: owner, toPubkey: userToken, lamports: BigInt(units.toString()) }),
      createSyncNativeInstruction(userToken),
    );
  }
  ixs.push(
    await p.methods
      .deposit(units)
      .accountsPartial({
        owner,
        config: pdas.config(),
        position: pdas.position(owner),
        asset: pdas.asset(mint),
        vault: pdas.collateralVault(mint),
        userToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction(),
  );
  if (asset === "SOL") ixs.push(createCloseAccountInstruction(userToken, owner, owner));
  return ixs;
}

export async function buildWithdraw(p: HodlpayProgram, owner: PublicKey, asset: CollateralId, amount: number) {
  const { mint, decimals } = MINTS[asset];
  const userToken = ata(mint, owner);
  const ixs: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(owner, userToken, owner, mint),
    await p.methods
      .withdraw(toUnits(amount, decimals))
      .accountsPartial({
        owner,
        config: pdas.config(),
        position: pdas.position(owner),
        asset: pdas.asset(mint),
        vault: pdas.collateralVault(mint),
        userToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(assetMetas())
      .instruction(),
  ];
  if (asset === "SOL") ixs.push(createCloseAccountInstruction(userToken, owner, owner));
  return ixs;
}

export async function buildCheckout(
  p: HodlpayProgram,
  owner: PublicKey,
  merchant: PublicKey,
  amountUsd: number,
  loanIndex: number,
) {
  const position = pdas.position(owner);
  const merchantUsdc = ata(USDC_MINT, merchant);
  return [
    createAssociatedTokenAccountIdempotentInstruction(owner, merchantUsdc, merchant, USDC_MINT),
    await p.methods
      .checkout(toUnits(amountUsd, USDC_DECIMALS))
      .accountsPartial({
        owner,
        config: pdas.config(),
        position,
        loan: pdas.loan(position, loanIndex),
        merchant,
        merchantUsdc,
        liquidityVault: pdas.liquidity(),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(assetMetas())
      .instruction(),
  ];
}

export async function buildRepay(p: HodlpayProgram, owner: PublicKey, loanIndex: number) {
  const position = pdas.position(owner);
  return [
    await p.methods
      .repay()
      .accountsPartial({
        owner,
        config: pdas.config(),
        position,
        loan: pdas.loan(position, loanIndex),
        userUsdc: ata(USDC_MINT, owner),
        liquidityVault: pdas.liquidity(),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction(),
  ];
}

export async function buildLiquidate(
  p: HodlpayProgram,
  liquidator: PublicKey,
  owner: PublicKey,
  asset: CollateralId,
  repayUsd: BN,
) {
  const { mint } = MINTS[asset];
  return [
    createAssociatedTokenAccountIdempotentInstruction(liquidator, ata(mint, liquidator), liquidator, mint),
    await p.methods
      .liquidate(repayUsd)
      .accountsPartial({
        liquidator,
        config: pdas.config(),
        position: pdas.position(owner),
        asset: pdas.asset(mint),
        vault: pdas.collateralVault(mint),
        liquidatorUsdc: ata(USDC_MINT, liquidator),
        liquidatorCollateral: ata(mint, liquidator),
        liquidityVault: pdas.liquidity(),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts(assetMetas())
      .instruction(),
  ];
}

/** Permissionless price refresh from a verified Pyth `PriceUpdateV2` account. */
export async function buildRefreshPrice(p: HodlpayProgram, asset: CollateralId, priceUpdate: PublicKey) {
  return p.methods
    .refreshPrice()
    .accountsPartial({ config: pdas.config(), asset: pdas.asset(MINTS[asset].mint), priceUpdate })
    .instruction();
}

async function lpInstruction(p: HodlpayProgram, provider: PublicKey, deposit: boolean, units: BN) {
  const accounts = {
    provider,
    config: pdas.config(),
    providerUsdc: ata(USDC_MINT, provider),
    providerLp: ata(pdas.lpMint(), provider),
    liquidityVault: pdas.liquidity(),
    lpMint: pdas.lpMint(),
    tokenProgram: TOKEN_PROGRAM_ID,
  };
  const m = deposit ? p.methods.depositLiquidity(units) : p.methods.withdrawLiquidity(units);
  return m.accountsPartial(accounts).instruction();
}

/** Supply USDC to the lending pool in exchange for LP shares. */
export async function buildLpDeposit(p: HodlpayProgram, provider: PublicKey, amountUsd: number) {
  return [
    createAssociatedTokenAccountIdempotentInstruction(provider, ata(pdas.lpMint(), provider), provider, pdas.lpMint()),
    await lpInstruction(p, provider, true, toUnits(amountUsd, USDC_DECIMALS)),
  ];
}

/** Redeem LP shares (6 decimals) for their share of the pool. */
export async function buildLpWithdraw(p: HodlpayProgram, provider: PublicKey, shares: number) {
  return [
    createAssociatedTokenAccountIdempotentInstruction(provider, ata(USDC_MINT, provider), provider, USDC_MINT),
    await lpInstruction(p, provider, false, toUnits(shares, USDC_DECIMALS)),
  ];
}

export interface PoolStats {
  idle: number;
  debt: number;
  value: number;
  shares: number;
  sharePrice: number;
  feesEarned: number;
  /** Merchant fees on open loans, credited to LPs as installments are repaid. */
  unearned: number;
  utilization: number;
}

export async function fetchPool(p: HodlpayProgram): Promise<PoolStats> {
  const conn = p.provider.connection;
  const [c, idle, supply] = await Promise.all([
    p.account.config.fetch(pdas.config()),
    conn.getTokenAccountBalance(pdas.liquidity()),
    conn.getTokenSupply(pdas.lpMint()),
  ]);
  const i = Number(idle.value.uiAmount ?? 0);
  const debt = fromUnits(c.totalDebt, USDC_DECIMALS);
  const shares = Number(supply.value.uiAmount ?? 0);
  const unearned = fromUnits(c.unearnedFees, USDC_DECIMALS);
  const value = i + debt - unearned;
  return {
    idle: i,
    debt,
    value,
    shares,
    sharePrice: shares ? value / shares : 1,
    feesEarned: fromUnits(c.feesEarned, USDC_DECIMALS),
    unearned,
    utilization: value ? (debt - unearned) / value : 0,
  };
}

export function tx(...ixs: TransactionInstruction[]) {
  return new Transaction().add(...ixs);
}

export interface ChainAsset {
  id: CollateralId;
  price: number;
  updatedAt: number;
  maxLtv: number;
  marginLtv: number;
  liquidationLtv: number;
}

export interface ChainLoan {
  address: string;
  index: number;
  merchant: string;
  principal: number;
  merchantReceived: number;
  installmentAmount: number;
  installmentsTotal: number;
  installmentsPaid: number;
  repaid: number;
  lateFeesPaid: number;
  fee: number;
  feeEarned: number;
  createdAt: number;
  nextDueAt: number;
}

export interface ChainPosition {
  exists: boolean;
  collateral: Record<CollateralId, number>;
  debt: number;
  creditBalance: number;
  loanCount: number;
}

export interface ChainConfig {
  merchantFeeBps: number;
  liquidationBonusBps: number;
  closeFactorBps: number;
  installmentInterval: number;
  maxPriceAge: number;
  lateFeeBps: number;
  gracePeriod: number;
}

export async function fetchConfig(p: HodlpayProgram): Promise<ChainConfig> {
  const c = await p.account.config.fetch(pdas.config());
  return {
    merchantFeeBps: c.merchantFeeBps,
    liquidationBonusBps: c.liquidationBonusBps,
    closeFactorBps: c.closeFactorBps,
    installmentInterval: c.installmentInterval.toNumber(),
    maxPriceAge: c.maxPriceAge.toNumber(),
    lateFeeBps: c.lateFeeBps,
    gracePeriod: c.gracePeriod.toNumber(),
  };
}

export async function fetchAssets(p: HodlpayProgram): Promise<Record<CollateralId, ChainAsset>> {
  const out = {} as Record<CollateralId, ChainAsset>;
  for (const id of Object.keys(MINTS) as CollateralId[]) {
    const a = await p.account.collateralAsset.fetch(pdas.asset(MINTS[id].mint));
    out[id] = {
      id,
      price: fromUnits(a.priceE6, 6),
      updatedAt: a.priceUpdatedAt.toNumber(),
      maxLtv: a.maxLtvBps / 10_000,
      marginLtv: a.marginLtvBps / 10_000,
      liquidationLtv: a.liquidationLtvBps / 10_000,
    };
  }
  return out;
}

export async function fetchPosition(p: HodlpayProgram, owner: PublicKey): Promise<ChainPosition> {
  const acc = await p.account.position.fetchNullable(pdas.position(owner));
  const collateral: Record<CollateralId, number> = { SOL: 0, zenZEC: 0 };
  if (!acc) return { exists: false, collateral, debt: 0, creditBalance: 0, loanCount: 0 };
  acc.mints.forEach((m, i) => {
    for (const id of Object.keys(MINTS) as CollateralId[]) {
      if (m.equals(MINTS[id].mint)) collateral[id] = fromUnits(acc.amounts[i], MINTS[id].decimals);
    }
  });
  return {
    exists: true,
    collateral,
    debt: fromUnits(acc.debt, USDC_DECIMALS),
    creditBalance: fromUnits(acc.creditBalance, USDC_DECIMALS),
    loanCount: acc.loanCount,
  };
}

export async function fetchLoans(p: HodlpayProgram, owner: PublicKey, count: number): Promise<ChainLoan[]> {
  if (count === 0) return [];
  const position = pdas.position(owner);
  const keys = Array.from({ length: count }, (_, i) => pdas.loan(position, i));
  const accs = await p.account.loan.fetchMultiple(keys);
  return accs.flatMap((l, i) =>
    l
      ? [
          {
            address: keys[i].toBase58(),
            index: l.index,
            merchant: l.merchant.toBase58(),
            principal: fromUnits(l.principal, USDC_DECIMALS),
            merchantReceived: fromUnits(l.merchantReceived, USDC_DECIMALS),
            installmentAmount: fromUnits(l.installmentAmount, USDC_DECIMALS),
            installmentsTotal: l.installmentsTotal,
            installmentsPaid: l.installmentsPaid,
            repaid: fromUnits(l.repaid, USDC_DECIMALS),
            lateFeesPaid: fromUnits(l.lateFeesPaid, USDC_DECIMALS),
            fee: fromUnits(l.fee, USDC_DECIMALS),
            feeEarned: fromUnits(l.feeEarned, USDC_DECIMALS),
            createdAt: l.createdAt.toNumber(),
            nextDueAt: l.nextDueAt.toNumber(),
          },
        ]
      : [],
  );
}
