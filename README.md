# HodlPay

**Spend your crypto. Keep your crypto.**

HodlPay is crypto-backed Buy Now, Pay Later. Holders lock SOL or zenZEC (Zcash on Solana) as collateral and get a stablecoin credit line they can use at any checkout. The merchant is paid upfront in USDC on Solana or in stablecoins on Tempo; the user repays in 4 interest-free installments. No selling, no taxable event, no credit check.

Built for the Colosseum Crypto World's Fair (Solana, Tempo and Zcash tracks).

## How it works

1. **Lock**: deposit SOL or zenZEC into an on-chain vault. Each asset has its own risk tier.
2. **Pay**: at checkout the protocol pays the merchant from the liquidity vault, minus a 3% merchant fee.
3. **Repay**: 4 installments, 14 days apart, 0% interest for the user.
4. **Protect**: if collateral value falls, the keeper emits a margin alert first; only past the liquidation line can a liquidator repay part of the debt (max 50% per call) and take collateral at a 5% bonus. Repaid amounts are credited to the user's upcoming installments.

| Asset  | Max LTV | Margin alert | Liquidation |
| ------ | ------- | ------------ | ----------- |
| SOL    | 50%     | 65%          | 75%         |
| zenZEC | 40%     | 55%          | 65%         |

## Repository

```
protocol/   Anchor program (Rust) + LiteSVM integration tests
app/        Next.js console: vault, credit line, checkout, installments, risk desk
```

### Program instructions

`initialize`, `add_asset`, `update_price`, `set_keeper`, `fund_liquidity`, `open_position`, `deposit`, `withdraw`, `checkout`, `repay`, `liquidate`, `check_health`

Valuation, credit limits and liquidation thresholds are computed on-chain from the position's collateral slots and per-asset oracle prices. Stale prices (older than `max_price_age`) block new credit, withdrawals and liquidations.

## Run it

Program (requires Rust, Solana CLI and Anchor 1.x):

```bash
cd protocol
anchor build
cargo test
```

Console:

```bash
cd app
npm install
npm run dev
```

Prices come from Pyth Hermes when `PYTH_API_KEY` is set, otherwise from public market data.

## Roadmap

- Devnet deployment and wallet-connected console
- Keeper service: Pyth price posting, margin notifications, liquidation bot
- Tempo settlement contract for merchants who prefer Tempo stablecoins
- zenZEC mainnet mint integration
- Merchant SDK and Solana Pay checkout link
