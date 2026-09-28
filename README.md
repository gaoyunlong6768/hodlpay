# HodlPay

**Spend your crypto. Keep your crypto.**

HodlPay is crypto-backed Buy Now, Pay Later. Holders lock SOL or zenZEC (Zcash on Solana) as collateral and get a stablecoin credit line they can use at any checkout. The merchant is paid upfront in USDC on Solana or in stablecoins on Tempo; the user repays in 4 interest-free installments. No selling, no taxable event, no credit check.

Built for the Colosseum Crypto World's Fair (Solana, Tempo and Zcash tracks).

## How it works

1. **Lock**: deposit SOL or zenZEC into an on-chain vault. Each asset has its own risk tier.
2. **Pay**: at checkout the protocol pays the merchant from the liquidity pool, minus a 3% merchant fee. The merchant chooses the rail: USDC on Solana, or a TIP-20 stablecoin on Tempo.
3. **Repay**: 4 installments, 14 days apart, 0% interest for the user. Paying more than 3 days after a due date adds a 1% late fee on that installment.
4. **Protect**: the keeper posts oracle prices and emits a margin alert first; only past the liquidation line can a liquidator repay part of the debt (max 50% per call) and take collateral at a 5% bonus. Repaid amounts are credited to the user's upcoming installments.

| Asset  | Max LTV | Margin alert | Liquidation |
| ------ | ------- | ------------ | ----------- |
| SOL    | 50%     | 65%          | 75%         |
| zenZEC | 40%     | 55%          | 65%         |

### Who earns what

| Party     | Pays                          | Gets                                              |
| --------- | ----------------------------- | ------------------------------------------------- |
| Shopper   | 0% interest, late fee if late | Spending power without selling                    |
| Merchant  | 3% fee                        | Full amount upfront in stablecoins, no price risk |
| LP        | USDC into the pool            | Merchant fees + late fees, via LP share price     |

The pool is value-accruing: `pool value = idle USDC in vault + outstanding debt − unearned merchant fees`. The merchant fee on a loan is earned installment by installment, so an LP cannot capture a fee by depositing right before a checkout and withdrawing right after. LP shares are an SPL mint owned by the program; depositing mints shares at the current share price, withdrawing burns them and is limited to idle liquidity.

### Merchant side

- **Payment links** (`/pay?merchant=…&item=…&amount=…&rail=solana|tempo&to=…`): a hosted checkout any merchant can send or embed. The shopper connects a wallet, locks just enough SOL or zenZEC if their credit is short, and pays in 4. The merchant is paid in the same transaction.
- **Merchant portal** (`/merchant`): set payout addresses, generate a payment link, QR code and embeddable "Pay in 4 with HodlPay" button, and see every sale: Solana loans read from the program (filtered by merchant), Tempo payouts read from the settlement contract's `Settled` events.

### Oracle

Every asset stores its Pyth feed id. `refresh_price` is permissionless: anyone can pass a Pyth `PriceUpdateV2` account (for example the sponsored feed accounts Pyth keeps fresh on devnet and mainnet), and the program checks the owner (Pyth receiver), full Wormhole verification, the feed id, the confidence interval (≤ 2% of price) and the age before accepting it. Older updates never overwrite newer prices. The keeper uses this path when a fresh sponsored feed exists and falls back to posting prices itself (`update_price`) otherwise, e.g. on localnet or during the demo stress test.

## Architecture

```
                    ┌────────────── Solana ──────────────┐
 Shopper wallet ──▶ │ hodlpay program (Anchor)           │
                    │  position PDA: collateral slots    │
                    │  loan PDA: 4-installment schedule  │
                    │  vault PDAs: SOL / zenZEC / USDC   │
                    │  LP mint PDA: pool shares          │
                    └──────┬───────────────┬─────────────┘
                           │ USDC          │ USDC + memo "hodlpay:tempo:<0x merchant>"
                           ▼               ▼
                     Solana merchant   Tempo bridge account
                                           │ relayer verifies tx (amount + memo)
                                           ▼
                    ┌────────────── Tempo ───────────────┐
                    │ HodlPaySettlement.sol              │
                    │  settle(ref, merchant, token, amt) │
                    │  transferWithMemo(merchant, ref)   │
                    │  replay-protected per Solana sig   │
                    └────────────────────────────────────┘

 Keeper (app/scripts/keeper.ts or /api/keeper): Pyth → refresh_price (or update_price), scan positions,
 margin alerts (Telegram), liquidate unhealthy positions.
```

### Repository

```
protocol/   Anchor program (Rust) + LiteSVM integration tests
tempo/      Solidity settlement contract for Tempo merchants
app/        Next.js console, API routes (faucet, keeper, Tempo relayer) and ops scripts
docs/       Go-to-market notes, pitch and demo video scripts
```

### Program instructions

| Group     | Instructions                                                   |
| --------- | -------------------------------------------------------------- |
| Admin     | `initialize`, `add_asset`, `update_price`, `set_keeper`        |
| Oracle    | `refresh_price` (permissionless, Pyth)                         |
| Liquidity | `deposit_liquidity`, `withdraw_liquidity`                      |
| Position  | `open_position`, `deposit`, `withdraw`                         |
| Credit    | `checkout`, `repay`                                            |
| Risk      | `liquidate`, `check_health`                                    |

Valuation, credit limits and liquidation thresholds are computed on-chain from the position's collateral slots and per-asset oracle prices. Stale prices (older than `max_price_age`) block new credit, withdrawals and liquidations.

### Tempo rail

When a merchant wants settlement on Tempo, checkout pays the Tempo bridge account on Solana and attaches a memo `hodlpay:tempo:<evm address>`. The relayer (`/api/tempo/settle`) reads the confirmed Solana transaction, takes the amount from the bridge's USDC balance change and the merchant from the memo, then calls `HodlPaySettlement.settle` on Tempo. The contract pays the merchant with `transferWithMemo`, using `keccak256(solana signature)` as the memo, so every Tempo payment points back to its Solana checkout and cannot be settled twice.

Testnet deployment (Moderato, chain 42431): contract `0x0a5cdea68a5acd2d070ba9a2e39299356408c402`, paying AlphaUSD.

Trust model: the relayer is a single trusted key today. The contract refuses to settle the same Solana checkout twice, and the relayer software only pays the USDC that actually reached the bridge account, but the contract trusts the relayer key for the amount and the key can delay or refuse a settlement. The path to removing it is to have several independent relayers co-sign `settle`, then to verify the Solana checkout through a light-client or attestation bridge once one is available on Tempo. Merchants who need no trust assumption at all can settle in USDC on Solana.

### Zcash (zenZEC)

zenZEC is Zcash bridged to Solana by Zenrock: mainnet mint `JDt9rRGaieF6aN1cJkXFeUmsy7ZE4yY3CZb8tVMXVroS` (SPL Token, 8 decimals). HodlPay lists it as its own collateral asset with a tighter risk tier than SOL (40% max LTV) because of thinner liquidity. There is no devnet zenZEC, so localnet and devnet use a test mint with the same decimals; on mainnet, bootstrap with `ZEC_MINT=JDt9rRGaieF6aN1cJkXFeUmsy7ZE4yY3CZb8tVMXVroS` and the program uses the real token unchanged. ZEC prices come from the Pyth ZEC/USD feed.

Why it matters for ZEC holders: ZEC is a long-term privacy asset with almost nowhere to spend it and no lending venue, so today the only way to use it is to sell it. With HodlPay a holder keeps the position and spends against it:

1. Send ZEC from any Zcash wallet (shielded or transparent) to a personal deposit address from the [Zenrock mint page](https://app.zenrocklabs.io/services/zenzec/crucible/mint). zenZEC, 1:1 backed and held in decentralized MPC custody, arrives in the Solana wallet in about 5 minutes.
2. Lock zenZEC in HodlPay. It gets its own risk tier and oracle feed, separate from SOL.
3. Pay any merchant in 4. Repay and unlock, then redeem zenZEC back to ZEC on Zenrock.

The console links to the Zenrock mint page whenever zenZEC is selected.

## Run it locally

Requirements: Rust, Solana CLI 3.x, Anchor 1.x, Node 20+.

```bash
# 1. Build and test the program
cd protocol
anchor build
cargo test -p hodlpay

# 2. Start a local validator with the program preloaded
solana-test-validator --reset --ledger /tmp/hodlpay-ledger --limit-ledger-size 500000000 \
  --upgradeable-program 5WWDSNYRjmU3Jp7DywyYgDYtYiBBZ3e8JmcBgS2HxihH \
  target/deploy/hodlpay.so ~/.config/solana/id.json

# 3. Create mints, initialize config, list assets, seed the LP pool
cd ../app
npm install
npm run bootstrap

# 4. Optional: deploy the Tempo settlement contract (Moderato testnet)
npm run tempo:deploy

# 5. Run the console
npm run dev
```

Open the console, press **Use demo wallet**, then **Get test funds**, then lock collateral, check out, repay, and use the risk desk to trigger a liquidation.

Merchants: open `/merchant`, pick a demo merchant, generate a payment link and open it to pay as a shopper; the sale then shows up in the portal.

`npm run smoke` runs the full flow headlessly against the configured cluster: permissionless Pyth refresh, LP deposit, faucet, deposits, checkout, repay, Tempo settlement with replay check, price shock, liquidation and LP withdrawal. To exercise `refresh_price` on localnet with real Pyth data, dump the sponsored feed accounts from mainnet and load them into the validator:

```bash
solana account -um 7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE --output json -o sol-feed.json
solana-test-validator ... --account 7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE sol-feed.json
``` `npm run keeper` runs the standalone keeper loop (`-- --once` for a single pass).

### Devnet

```bash
solana config set --url devnet
cd protocol && anchor deploy --provider.cluster devnet
cd ../app && HODLPAY_CLUSTER=devnet npm run bootstrap
```

### Environment

| Variable | Used by | Purpose |
| --- | --- | --- |
| `ADMIN_SECRET_KEY` / `ADMIN_KEYPAIR` | API routes, scripts | Admin/keeper keypair (JSON array or path); defaults to `~/.config/solana/id.json` |
| `PYTH_API_KEY` | prices | Pyth Hermes; falls back to public market data |
| `HODLPAY_CLUSTER`, `HODLPAY_RPC`, `NEXT_PUBLIC_RPC` | bootstrap | Target cluster and RPC written to `deployment.json` |
| `USDC_MINT`, `ZEC_MINT` | bootstrap | Use existing mints (mainnet USDC / zenZEC) instead of test mints |
| `TEMPO_PRIVATE_KEY` | Tempo relayer | Relayer key; defaults to `app/.hodlpay/tempo-key.json` |
| `HODLPAY_STATE_DIR` | API routes | Writable dir for demo state (use `/tmp` on serverless) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | keeper | Push margin alerts |

## Roadmap

- Mainnet with real USDC and zenZEC; drop keeper-posted prices once every asset has a sponsored Pyth feed
- Merchant SDK (React button, webhooks on sale) and Solana Pay transaction requests
- Longer terms with interest for larger purchases
- Tempo-native repayments and a direct Tempo liquidity pool
