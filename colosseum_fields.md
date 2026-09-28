# Colosseum 项目字段（HodlPay）

与 Colosseum 网站草稿保持一致；改这里时同步改网站。

## Project name
HodlPay

## Brief description (<=500)
HodlPay is crypto-backed Buy Now, Pay Later. Holders lock SOL or zenZEC as collateral and get a stablecoin credit line to pay any merchant: no selling, no taxable event, no credit check. Merchants are paid upfront in USDC on Solana or stablecoins on Tempo; users repay in 4 interest-free installments. An on-chain risk engine sets LTV per asset, sends margin alerts and liquidates only as a last resort. Built by a founder who launched BNPL for 500k users and crypto lending at a $1B+ AUM firm.

## What are you building, and who is it for? (<=1000)
HodlPay lets crypto holders spend without selling. A user locks SOL or zenZEC (Zcash on Solana) in an on-chain vault and gets a stablecoin credit line sized by a per-asset loan-to-value. At checkout the merchant is paid instantly and in full, in USDC on Solana or a Tempo stablecoin, and the user repays in 4 interest-free installments. If collateral falls, the user gets a margin alert and can top up or repay early; liquidation is partial and a last resort. Merchants get hosted payment links, a QR code and a portal showing sales on both rails.

Who it is for: (1) long-term holders who need liquidity but don't want to sell and realize gains; (2) users in emerging markets with thin credit files but real crypto wealth; (3) merchants that want to accept crypto credit with zero price risk. Revenue: 3% merchant fee (like BNPL) plus late fees, shared with USDC liquidity providers through an on-chain LP pool.

## Why did you decide to build this, and why build it now? (<=1000)
I have built both halves of this product. At Hengchang I led a Buy Now, Pay Later product from zero to launch: 500k+ users, 10k+ merchants, 22% merchant conversion lift, with order, credit-limit, settlement and collections systems. At Babel Finance I designed institutional crypto lending and structured products for a platform with $1B+ AUM, plus KYC/AML covering 20+ jurisdictions. I also led funding-side pricing across 30+ licensed lenders, cutting funding cost 15%.

Why now: stablecoin payments finally work at checkout (fast, cheap settlement on Solana; Tempo is purpose-built for payments), on-chain oracles make real-time LTV management reliable, and ZEC is now usable as collateral on Solana. Yet holders still choose between selling (and paying tax) and an interest-bearing loan with no end date, from crypto cards or money markets. BNPL moved over $500B of purchases in 2025; crypto has the collateral, it lacks a merchant-funded checkout.

## Technologies (<=500)
Solana: Anchor 1.x (Rust) program for vaults, credit line, installments, partial liquidation and an LP pool; SPL Token/USDC; permissionless Pyth price refresh; zenZEC collateral; Memo program; LiteSVM tests. Tempo: Solidity settlement contract (TIP-20 transferWithMemo, replay-protected) on Moderato, viem relayer. App: Next.js, TypeScript, Wallet Adapter, Tailwind; payment links and merchant portal. Keeper: TypeScript (prices, margin alerts, liquidation). Dev/AI: Cursor, Solana CLI, Anchor, solc.

## Chains
Solana, Tempo, Zcash

## How does your product use these chains? (<=500)
Solana: core protocol. Collateral vaults, credit line, installments, liquidation and the LP pool are one Anchor program; merchants are paid in USDC at checkout. Zcash: zenZEC (ZEC on Solana) is collateral with its own 40% LTV tier, so ZEC holders spend without selling. Tempo: merchants can be paid in Tempo stablecoins; a relayer verifies the Solana checkout and our contract pays them with transferWithMemo, linked to the Solana tx.

## Category
Payments & Remittance

## Country
China

## Telegram
（需要你本人提供）
