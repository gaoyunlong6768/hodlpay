# HodlPay

[![CI](https://github.com/gaoyunlong6768/hodlpay/actions/workflows/ci.yml/badge.svg)](https://github.com/gaoyunlong6768/hodlpay/actions/workflows/ci.yml)

**Spend your crypto. Keep your crypto.**

HodlPay is crypto-backed Buy Now, Pay Later. Holders lock SOL or zenZEC (Zcash on Solana) as collateral and get a stablecoin credit line they can use at any checkout. The merchant is paid upfront in USDC on Solana or in stablecoins on Tempo; the user repays in 4 interest-free installments. No selling, no taxable event, no credit check.

Built for the Colosseum Crypto World's Fair (Solana, Tempo and Zcash tracks).

## Try it

**Live on Solana devnet: [hodlpay.vercel.app](https://hodlpay.vercel.app)**

1. Open the console and click **Use demo wallet** (or connect Phantom set to devnet).
2. Click **Get test funds**: 2,000 test USDC, 3 test zenZEC and a little SOL for fees.
3. Lock zenZEC, buy the $860 flight and pick the settlement rail (USDC on Solana or stablecoins on Tempo).
4. Repay an installment, then drag the Risk desk slider to -60% to trigger a margin alert and a keeper liquidation.

Merchants can generate a payment link and QR code at [hodlpay.vercel.app/merchant](https://hodlpay.vercel.app/merchant). Every action is a real devnet transaction linked to the explorer.

| | |
| --- | --- |
| Program (devnet) | [`5WWDSNYRjmU3Jp7DywyYgDYtYiBBZ3e8JmcBgS2HxihH`](https://explorer.solana.com/address/5WWDSNYRjmU3Jp7DywyYgDYtYiBBZ3e8JmcBgS2HxihH?cluster=devnet) |
| Test USDC mint | [`52WhUKNE1iz9Ddgc1BoqUfADuFQAxViW9m6Hnao3NdBg`](https://explorer.solana.com/address/52WhUKNE1iz9Ddgc1BoqUfADuFQAxViW9m6Hnao3NdBg?cluster=devnet) |
| Test zenZEC mint | [`6t8pBbX7hMtXmFjfJDjMiiGrPqYXbK7YzK1SzSqkcb2J`](https://explorer.solana.com/address/6t8pBbX7hMtXmFjfJDjMiiGrPqYXbK7YzK1SzSqkcb2J?cluster=devnet) |

![HodlPay home](docs/screenshots/home.png)

| Checkout: merchant paid upfront, 4 installments scheduled | Merchant portal: payment link, QR code, sales |
| --- | --- |
| ![Checkout and installments](docs/screenshots/checkout.png) | ![Merchant portal](docs/screenshots/merchant.png) |

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

### How it compares

Spending against crypto collateral already exists. What is different here is who pays and how the debt is shaped: HodlPay is BNPL, not a loan. The merchant pays a fee in exchange for a sale and upfront settlement, so the shopper pays 0% interest on a fixed 4-installment schedule.

| | HodlPay | Buydl | ether.fi Cash (Borrow Mode) | Nexo Card (Credit Mode) | Klarna / Affirm |
| --- | --- | --- | --- | --- | --- |
| Shopper cost | 0% interest, late fee only | Kamino borrow rate | Variable Aave rate from day one | Credit-line rate by loyalty tier | 0% on pay-in-4 |
| Who funds it | Merchant fee (3%) to an LP pool | Shopper interest to Kamino lenders | Shopper interest to Aave lenders | Shopper interest to Nexo | Merchant fee |
| Repayment | 4 installments, 14 days apart | Open-ended loan | Open-ended, no schedule | Open-ended | 4 installments |
| Collateral | SOL, zenZEC (per-asset risk tiers) | SOL | Vault assets (ETH, BTC, stables…) | Custodial deposit | None, credit check |
| Merchant settlement | USDC on Solana or stablecoins on Tempo | USDC on Solana | Visa rails | Visa rails | Fiat, days later |
| Custody | Non-custodial program | Non-custodial (Kamino) | Non-custodial (Safe) | Custodial | n/a |

- **Versus crypto cards and borrow routers**: they are loans with the shopper paying interest for as long as the balance is open. HodlPay moves the cost to the merchant, which is how BNPL wins checkout share, and gives the shopper a fixed end date. The merchant also gets a sales channel: hosted payment links and a portal, not just a payment method.
- **Versus Klarna and Affirm**: same economics for the merchant, but no credit check, so it serves crypto holders anywhere, and the merchant is paid in stablecoins in seconds instead of fiat in days.
- **Chains and assets**: Tempo settlement for merchants who want payment-chain stablecoins, and zenZEC collateral so ZEC holders can pay at checkout, where today their only on-chain option on Solana is an interest-bearing loan (Kamino's ZEC market).

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

When a merchant wants settlement on Tempo, checkout pays the Tempo bridge account on Solana and attaches a memo `hodlpay:tempo:<evm address>`. The relayer (`/api/tempo/settle`) reads the confirmed Solana transaction, accepts it only if it holds exactly one HodlPay `checkout` whose merchant account is the bridge, takes the amount from the on-chain loan (`merchant_received`) and the merchant from the memo, then calls `HodlPaySettlement.settle` on Tempo. The contract pays the merchant with `transferWithMemo`, using `keccak256(solana signature)` as the memo, so every Tempo payment points back to its Solana checkout and cannot be settled twice.

Testnet deployment (Moderato, chain 42431): contract `0x0a5cdea68a5acd2d070ba9a2e39299356408c402`, paying AlphaUSD.

Trust model: the relayer is a single trusted key today. The contract refuses to settle the same Solana checkout twice, and the relayer software only pays the USDC that actually reached the bridge account, but the contract trusts the relayer key for the amount and the key can delay or refuse a settlement. The path to removing it is to have several independent relayers co-sign `settle`, then to verify the Solana checkout through a light-client or attestation bridge once one is available on Tempo. Merchants who need no trust assumption at all can settle in USDC on Solana.

### Zcash (zenZEC)

zenZEC is Zcash bridged to Solana by Zenrock: mainnet mint `JDt9rRGaieF6aN1cJkXFeUmsy7ZE4yY3CZb8tVMXVroS` (SPL Token, 8 decimals). HodlPay lists it as its own collateral asset with a tighter risk tier than SOL (40% max LTV) because of thinner liquidity. There is no devnet zenZEC, so localnet and devnet use a test mint with the same decimals; on mainnet, bootstrap with `ZEC_MINT=JDt9rRGaieF6aN1cJkXFeUmsy7ZE4yY3CZb8tVMXVroS` and the program uses the real token unchanged. ZEC prices come from the Pyth ZEC/USD feed.

Why it matters for ZEC holders: ZEC is a long-term privacy asset with almost nowhere to spend it. On Solana, holders can now borrow USDC against bridged ZEC on Kamino, but that is an open-ended loan at a variable rate, and the USDC still has to find its way to a merchant. With HodlPay a holder keeps the position and pays at checkout, interest-free in 4:

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
cd protocol && solana program deploy target/deploy/hodlpay.so \
  --program-id target/deploy/hodlpay-keypair.json \
  --max-len $(wc -c < target/deploy/hodlpay.so)
cd ../app && HODLPAY_CLUSTER=devnet npm run bootstrap
```

The release profile builds with `opt-level = "z"` (about 390 KB), so the deploy costs about 2 SOL in rent. Sizing the program account to the binary instead of the default headroom, and skipping the on-chain IDL (the app ships its own), keeps it there; `solana program extend` adds space for a larger upgrade later (the loader requires at least 10240 bytes per extend). On devnet the faucet gives each new wallet 0.03 SOL for fees; collateral for the demo is test zenZEC.

### Environment

| Variable | Used by | Purpose |
| --- | --- | --- |
| `ADMIN_SECRET_KEY` / `ADMIN_KEYPAIR` | API routes, scripts | Admin/keeper keypair (JSON array or path); defaults to `~/.config/solana/id.json` |
| `PYTH_API_KEY` | prices | Pyth Hermes; falls back to public market data |
| `HODLPAY_CLUSTER`, `HODLPAY_RPC`, `NEXT_PUBLIC_RPC` | bootstrap | Target cluster and RPC written to `deployment.json` |
| `USDC_MINT`, `ZEC_MINT` | bootstrap | Use existing mints (mainnet USDC / zenZEC) instead of test mints |
| `TEMPO_PRIVATE_KEY` | Tempo relayer | Relayer key; defaults to `app/.hodlpay/tempo-key.json` |
| `HODLPAY_STATE_DIR` | API routes | Writable dir for demo state (use `/tmp` on serverless) |
| `SOLANA_RPC` | API routes | Private RPC for server-side calls; browsers keep the public RPC from `deployment.json` |
| `FAUCET_RESERVE_SOL` | faucet | Admin SOL kept for keeper fees; the faucet pauses below it (default 1) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | keeper | Push margin alerts |

## Trust assumptions and known limitations

HodlPay is a hackathon build on devnet and has not been audited. What a user has to trust today, and what would change before mainnet:

| Area | Today | Before mainnet |
| --- | --- | --- |
| Custody | Collateral and pool USDC sit in program-owned PDAs. There is no admin instruction that can move them; only the position owner (withdraw, repay), LPs (their share of idle liquidity) and liquidators (past the liquidation line) move funds. The program's upgrade authority is still a single key. | Upgrade authority to a multisig with a timelock, then freeze. |
| Oracle | `refresh_price` is permissionless and fully checks Pyth updates. `update_price` lets the keeper key post any positive price; the demo uses it for the stress test and for assets without a fresh sponsored feed. A compromised keeper key could therefore trigger liquidations. | Pyth-only pricing (remove or bound `update_price`), plus a confidence and deviation guard against the last price. |
| Liquidation | The `liquidate` instruction is permissionless, capped at 50% of debt per call with a 5% bonus. On the demo site the keeper only liquidates the position of the visitor who presses the button, so one visitor's stress test never liquidates another's position. | Open liquidation to any bot; keeper becomes one liquidator among many. |
| Tempo rail | A single relayer key settles on Tempo (see [Tempo rail](#tempo-rail)); the contract blocks double settlement but trusts the relayer for the amount. | Several co-signing relayers, then light-client or attestation verification. |
| Collateral | Devnet uses test USDC and test zenZEC mints the admin can mint. | Real USDC and Zenrock zenZEC (`ZEC_MINT`), no mint authority. |
| Demo operations | The site's faucet and keeper are paid by one devnet admin wallet; the faucet pauses below 1 SOL so price updates keep running. The stress test shifts the shared devnet oracle and reverts to live prices after 3 minutes. | Not applicable on mainnet (no faucet, no stress test). |
| Credit risk | Installment plans are over-collateralized (max LTV 40–50%), there is no credit scoring, and a 1% late fee is the only penalty besides liquidation. A missed installment is not enforced on its own: it accrues the late fee when paid, but only the LTV can trigger a liquidation. | Tune tiers on live volatility data; add a reserve fund from part of the merchant fee; make a long-overdue installment liquidatable. |
| Bad debt | If a crash seizes all collateral and debt remains, `liquidate` writes it off: the debt leaves the pool's books (`bad_debt` in the event) and the LP pool absorbs the loss. Liquidation proceeds already credited to the position still pay down later installments. | Reserve fund covers write-offs before LPs. |
| LP pool | Merchant fees accrue to LP shares on checkout, so a deposit just before a large checkout captures part of its fee. The share price cannot be inflated by a first depositor because the pool is seeded at bootstrap. | Stream fees over the installment term; minimum-liquidity lock on new pools. |
| Assets | Only classic SPL Token mints (not Token-2022) can be listed. | Token-2022 support when a listed asset needs it. |

## Roadmap

- Mainnet with real USDC and zenZEC; drop keeper-posted prices once every asset has a sponsored Pyth feed
- Merchant SDK (React button, webhooks on sale) and Solana Pay transaction requests
- Longer terms with interest for larger purchases
- Tempo-native repayments and a direct Tempo liquidity pool

## License

MIT, see [LICENSE](LICENSE).
