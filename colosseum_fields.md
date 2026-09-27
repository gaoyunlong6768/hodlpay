# Colosseum 项目字段（HodlPay）

## Project name
HodlPay

## Brief description (<=500)
HodlPay is crypto-backed Buy Now, Pay Later. Holders lock SOL, zenZEC or other assets as collateral and instantly get a stablecoin credit line to pay any merchant: no selling, no taxable event, no credit check. Merchants are paid upfront in USDC on Solana or stablecoins on Tempo; users repay in 4 installments. A risk engine sets LTV per asset, sends margin alerts and liquidates only as a last resort. Built by a founder who launched BNPL for 500k users and crypto lending at a $1B+ AUM firm.

## What are you building, and who is it for? (<=1000)
HodlPay lets crypto holders spend without selling. A user deposits SOL, zenZEC (Zcash on Solana) or other liquid assets into an on-chain collateral vault and receives a stablecoin credit line sized by a per-asset loan-to-value. At checkout they pay with HodlPay: the merchant is settled instantly and in full in USDC (Solana) or a Tempo stablecoin, and the user repays in 4 interest-free installments or a longer term with interest. If collateral value drops, the risk engine sends margin alerts, offers top-up or partial repayment, and only liquidates as a last resort.

Who it is for: (1) long-term holders who need liquidity but don't want to sell and realize gains; (2) users in emerging markets with thin credit files but real crypto wealth; (3) merchants and payment apps that want to accept "crypto credit" with zero price risk. Revenue: merchant fee (2-4%, like BNPL) plus interest on extended terms.

## Why did you decide to build this, and why build it now? (<=1000)
I have built both halves of this product. At Hengchang I led a Buy Now, Pay Later product from zero to launch: 500k+ users, 10k+ merchants, 22% merchant conversion lift, with order, credit-limit, settlement and collections systems. At Babel Finance I designed institutional crypto lending and structured products for a platform with $1B+ AUM, plus KYC/AML covering 20+ jurisdictions. I also led funding-side pricing across 30+ licensed lenders, cutting funding cost 15%.

Why now: stablecoin payments finally work at checkout (fast, cheap settlement on Solana; Tempo is purpose-built for payments), on-chain price oracles make real-time LTV management reliable, and assets like ZEC are now usable as collateral on Solana. Meanwhile crypto holders still face a bad choice: sell (and pay tax) or borrow on DeFi protocols with no spending rail. BNPL is a proven $300B+ category; crypto has the collateral, it just lacks the checkout.

## Technologies (<=?)
Solana: Anchor (Rust) programs for the collateral vault, credit line and installment schedule; SPL Token/USDC; Pyth price feeds for LTV and liquidation; zenZEC as Zcash collateral; Solana Pay checkout. Tempo: stablecoin merchant settlement (EVM, Solidity, viem). App: Next.js, TypeScript, Solana Wallet Adapter, Tailwind. Risk engine: TypeScript/Python service for LTV tiers, margin alerts and liquidation keeper. Dev/AI tools: Cursor (AI coding agent), Solana CLI, Anchor, Surfpool/local validator.

## Chains
Solana, Tempo, Zcash

## How does your product use these chains? (<=500)
Solana: core protocol. Collateral vault, credit line, installment schedule and liquidation run as Anchor programs; USDC credit is drawn and merchants are paid via Solana Pay. Zcash: ZEC (zenZEC on Solana) is accepted as collateral with its own LTV tier, so ZEC holders can spend without selling. Tempo: merchants can choose to be settled in Tempo stablecoins; repayments and settlement records are mirrored there for payment-native merchants.

## Category
Payments（没有则 DeFi）

## Country
China

## Telegram
（需要你本人提供）
