# HodlPay go-to-market

## The wedge

Crypto holders with real wealth and a reason not to sell: unrealized gains, long-term conviction, or no local credit history. Today they either sell (tax event, lost upside) or borrow: a crypto card's borrow mode, a checkout router on top of a money market, or a DeFi loan they bridge to a merchant themselves. Every one of those is a loan the shopper pays interest on with no end date. HodlPay is BNPL on collateral: the merchant pays the fee, the shopper gets 4 interest-free installments.

Start with purchases that are large enough to matter and paid online in stablecoins already:

1. **Travel** (flights, hotels, nomad housing): tickets of $500 to $3,000, customers already crypto-heavy.
2. **Hardware and furniture** for remote workers.
3. **Crypto-native commerce**: merchants already on Solana Pay, Helio, Sphere and Tempo payment rails.

## Customers

| Segment | Pain | Why HodlPay |
| --- | --- | --- |
| Long-term SOL holders | Selling triggers tax and misses upside | Spend now, repay over 6 weeks, keep the SOL |
| ZEC holders | Privacy asset with few places to spend it; the only Solana credit option (Kamino's ZEC market) is an interest-bearing loan | zenZEC collateral tier, spend without selling |
| Emerging-market users | Thin credit files, real crypto balances | Credit sized by collateral, no credit check; on-time repayments raise the limit and build an on-chain record |
| Merchants | BNPL lifts conversion but Klarna/Affirm do not serve crypto buyers | Paid upfront in USDC or Tempo stablecoins, zero price risk, 1.5% fee: half of unsecured BNPL (Klarna, Affirm, Yumi Finance) because collateral removes default losses |

## Channels

0. **Zero-integration start**: shoppers can already pay any Solana Pay USDC merchant in 4 by scanning its QR; the merchant sees a normal payment and pays nothing, the shopper carries the 1.5%. Every such sale is a lead: "your customers already pay you in 4 through HodlPay; take the fee off them and get a payment link."
1. **Merchant integrations** (supply side): hosted payment links and a Tempo settlement option. Target 10 design-partner merchants in travel and crypto commerce; each brings its own buyers.
2. **Wallet and payment-app partners**: HodlPay as a "Pay in 4" option inside wallets and card/payment apps that already hold user collateral.
3. **Zcash community**: first venue to spend ZEC on credit; co-marketing with the Zenrock bridge.
4. **LP side**: USDC holders earn merchant-fee yield that is uncorrelated with DeFi lending rates. Launch with a capped pool and grow the cap with repayment performance.

## Economics (per $1,000 purchase)

| Line | Amount |
| --- | --- |
| Merchant fee (1.5%) | $15, split on-chain: $10.50 to LPs, $3 to the HodlPay treasury, $1.50 to the first-loss reserve |
| Capital used | $985, amortizing over 42 days: equivalent to $985 for 21 days |
| LP yield on deployed capital | 10.50 / 985 × 365 / 21 ≈ 18.5% APR before late fees; realized pool APY = this × utilization |
| Credit loss | near zero by design: overcollateralized, keeper liquidates before debt exceeds collateral; whatever slips through hits the reserve before LPs |

Protocol revenue is live in the program: 20% of every fee paid in cash accrues to the treasury (0.3% of purchase volume), 10% to the reserve. At the +3 month target of $250k volume that is $750 of treasury revenue; at $10M a year, $30k. The split is a parameter (`set_protocol`), capped at 50% so LPs always keep most of the yield.

## Milestones

| When | Goal |
| --- | --- |
| Hackathon | Working protocol on devnet, Tempo settlement on testnet, live console |
| +1 month | Mainnet beta with capped pool, 3 design-partner merchants |
| +3 months | 10 merchants, $250k purchase volume, first LP cohort |
| +6 months | Merchant SDK, wallet partner integration, extended terms with interest |

## Risks and answers

- **Capital efficiency**: collateral must exceed the purchase, so the market is holders who won't sell, not everyone. We cut what they lock: the first installment is paid inside checkout, so only the remaining 75% counts against the limit ($1,500 of SOL for a $1,000 purchase instead of $2,000), and on-time repayments lower it to $1,250.
- **Collateral crash**: per-asset LTV tiers, margin alerts before liquidation, 50% close factor, 5% bonus for liquidators, stale-price guard.
- **Liquidity crunch**: withdrawals limited to idle liquidity; utilization shown in the pool; on-chain beta caps on purchase size and total debt.
- **Regulation**: users borrow against their own assets with no interest in the base product; merchants receive stablecoins. KYC at checkout thresholds when we move to fiat-facing merchants.
- **Oracle risk**: Pyth prices with a max age; every credit or liquidation action refuses stale prices.
- **Unsecured crypto BNPL** (Yumi Finance): same pay-in-4 shape, opposite risk model. Yumi underwrites unsecured credit and prices defaults into a 3% fee; we lend only against collateral, need no personal data, collect missed payments from collateral and charge 1.5%. Yumi fits shoppers without crypto wealth, we fit holders who won't sell.
- **Competition**: crypto cards (ether.fi Cash, Nexo) and checkout routers (Buydl on Kamino) already let holders spend against collateral, all as interest-bearing loans. Our edge is the BNPL model (merchant-funded, 0% for the shopper, fixed schedule) and the merchant side: payment links, a portal and settlement on Solana or Tempo. If a money market adds pay-in-4, our pool and risk engine can plug into its liquidity instead of competing with it.
