# Colosseum 项目字段（HodlPay）

## Project name
HodlPay

## Brief description (<=500)
HodlPay is crypto-backed Buy Now, Pay Later. Holders lock SOL, zenZEC or other assets as collateral and instantly get a stablecoin credit line to pay any merchant: no selling, no taxable event, no credit check. Merchants are paid upfront in USDC on Solana or stablecoins on Tempo; users repay in 4 installments. A risk engine sets LTV per asset, sends margin alerts and liquidates only as a last resort. Built by a founder who launched BNPL for 500k users and crypto lending at a $1B+ AUM firm.

## What are you building, and who is it for? (<=1000)
HodlPay lets crypto holders spend without selling. A user deposits SOL, zenZEC (Zcash on Solana) or other liquid assets into an on-chain collateral vault and receives a stablecoin credit line sized by a per-asset loan-to-value. At checkout they pay with HodlPay: the merchant is settled instantly and in full in USDC (Solana) or a Tempo stablecoin, and the user repays in 4 interest-free installments or a longer term with interest. If collateral value drops, the risk engine sends margin alerts, offers top-up or partial repayment, and only liquidates as a last resort.

Who it is for: (1) long-term holders who need liquidity but don't want to sell and realize gains; (2) users in emerging markets with thin credit files but real crypto wealth; (3) merchants and payment apps that want to accept "crypto credit" with zero price risk. Revenue: 3% merchant fee (like BNPL) plus late fees, shared with USDC liquidity providers via an on-chain LP pool.

## Why did you decide to build this, and why build it now? (<=1000)
I have built both halves of this product. At Hengchang I led a Buy Now, Pay Later product from zero to launch: 500k+ users, 10k+ merchants, 22% merchant conversion lift, with order, credit-limit, settlement and collections systems. At Babel Finance I designed institutional crypto lending and structured products for a platform with $1B+ AUM, plus KYC/AML covering 20+ jurisdictions. I also led funding-side pricing across 30+ licensed lenders, cutting funding cost 15%.

Why now: stablecoin payments finally work at checkout (fast, cheap settlement on Solana; Tempo is purpose-built for payments), on-chain price oracles make real-time LTV management reliable, and assets like ZEC are now usable as collateral on Solana. Meanwhile crypto holders still face a bad choice: sell (and pay tax) or borrow on DeFi protocols with no spending rail. BNPL is a proven $300B+ category; crypto has the collateral, it just lacks the checkout.

## Technologies (<=?)
Solana: Anchor 1.x (Rust) program for collateral vaults, credit line, 4-installment loans, partial liquidation and an LP share pool; SPL Token/USDC; permissionless Pyth price refresh (verified PriceUpdateV2 accounts) with keeper fallback; zenZEC as Zcash collateral; Memo program to route Tempo settlements; LiteSVM integration tests. Tempo: Solidity settlement contract (TIP-20 transferWithMemo, replay-protected per Solana signature) on Moderato testnet, relayer built with viem. App: Next.js, TypeScript, Solana Wallet Adapter, Tailwind; hosted checkout links and a merchant portal (payment links, QR, sales across Solana and Tempo). Keeper: TypeScript service for price posting, margin alerts (Telegram) and liquidation. Dev/AI tools: Cursor (AI coding agent), Solana CLI, Anchor, solana-test-validator, solc.

## Chains
Solana, Tempo, Zcash

## How does your product use these chains? (<=500)
Solana: core protocol. Collateral vaults, credit line, installments, liquidation and the LP pool are one Anchor program; merchants are paid in USDC at checkout. Zcash: zenZEC (ZEC on Solana) is collateral with its own 40% LTV tier, so ZEC holders spend without selling. Tempo: merchants can be paid in Tempo stablecoins; a relayer verifies the Solana checkout and our contract pays them with transferWithMemo, linked to the Solana tx.

## Category
Payments（没有则 DeFi）

## Country
China

## Telegram
（需要你本人提供）
