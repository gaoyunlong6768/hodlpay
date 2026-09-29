# Colosseum 项目字段（HodlPay）

与 Colosseum 网站草稿保持一致；改这里时同步改网站。

## Project name
HodlPay

## Brief description (<=500)
HodlPay is crypto-backed Buy Now, Pay Later. Holders lock SOL or zenZEC and pay any merchant in 4 interest-free installments: no selling, no credit check, no personal data. Collateral is the credit check, and on-time repayments raise the limit on-chain. Merchants are paid upfront in USDC on Solana or stablecoins on Tempo for a 1.5% fee; missed payments are collected from collateral, not written off. Built by a founder who launched BNPL for 500k users and crypto lending at a $1B+ AUM firm.

## What are you building, and who is it for? (<=1000)
HodlPay lets crypto holders spend without selling. A user locks SOL or zenZEC (Zcash on Solana) in an on-chain vault and gets a stablecoin credit line sized by a per-asset loan-to-value. At checkout the merchant is paid instantly and in full, in USDC on Solana or a Tempo stablecoin, and the user repays in 4 interest-free installments. Every $250 repaid on time raises the wallet's max LTV (up to +10 points), so loyal users need less collateral, with no personal data. A missed installment is collected from collateral; liquidation is partial and a last resort. Merchants get payment links, a QR code and a sales portal.

Who it is for: (1) long-term holders who want liquidity without selling; (2) users in emerging markets with thin credit files but real crypto wealth; (3) merchants that want crypto credit with zero price risk. Revenue: 1.5% merchant fee (half of unsecured BNPL: no defaults to price in) plus late fees, shared with USDC liquidity providers via an on-chain LP pool.

## Why did you decide to build this, and why build it now? (<=1000)
I have built both halves of this product. At Hengchang I led a Buy Now, Pay Later product from zero to launch: 500k+ users, 10k+ merchants, 22% merchant conversion lift, with order, credit-limit, settlement and collections systems. At Babel Finance I designed institutional crypto lending and structured products for a platform with $1B+ AUM, plus KYC/AML covering 20+ jurisdictions. I also led funding-side pricing across 30+ licensed lenders, cutting funding cost 15%.

Why now: stablecoin payments finally work at checkout (fast, cheap settlement on Solana; Tempo is purpose-built for payments), on-chain oracles make real-time LTV management reliable, and ZEC is now usable as collateral on Solana. Yet holders still choose between selling (and paying tax) and an interest-bearing loan with no end date, from crypto cards or money markets. BNPL moved over $500B of purchases in 2025; crypto has the collateral, it lacks a merchant-funded checkout.

## Technologies (<=500)
Solana: Anchor 1.x (Rust) program: vaults, credit line, installments, on-time credit ladder, overdue collection, liquidation, LP pool; SPL Token/USDC; permissionless Pyth refresh; zenZEC; LiteSVM tests. Tempo: Solidity settlement (2-of-3 EIP-712 attesters, payout caps, TIP-20 transferWithMemo) on Moderato, viem; public audit page. App: Next.js, TypeScript, Wallet Adapter, Tailwind; payment links, merchant portal. Keeper: TypeScript + Vercel cron. Dev/AI: Cursor, Solana CLI, Anchor, solc.

## Chains
Solana, Tempo, Zcash

## How does your product use these chains? (<=500)
Solana: core protocol. Vaults, credit line, installments, liquidation and the LP pool are one Anchor program; merchants get USDC at checkout. Zcash: zenZEC (Zenrock's ZEC on Solana, tested against the real mint) is collateral with its own 40% LTV tier, so shielded ZEC holders spend without selling. Tempo: merchants can take Tempo stablecoins; 2 of 3 attesters verify the Solana checkout, our capped contract pays via transferWithMemo, and /audit reconciles every payout.

## Category
Payments & Remittance

## Country
China

## Telegram
gaobanxian

## Anything else judges should know? (<=500)
Live on Solana devnet and Tempo Moderato; open source, LiteSVM tests, CI. Worth checking: on-time repayments raise max LTV via an on-chain credit profile; missed installments are collected from collateral by a permissionless instruction (hourly keeper); /audit re-derives every Tempo payout from its Solana checkout. Honest limits: unaudited; we run all 3 Tempo attesters for now; the keeper can post stress-test prices; devnet uses test USDC and zenZEC (tests pass against the real zenZEC mint).

## Project website / Live product link
https://hodlpay.vercel.app

## GitHub link
https://github.com/gaoyunlong6768/hodlpay

## Repo context (<=500)
The whole product, built during the hackathon: protocol/ is the Anchor program on Solana with LiteSVM tests, tempo/ is the Solidity settlement contract on Tempo Moderato, app/ is the Next.js console, hosted checkout, merchant portal and Tempo audit page, plus keeper, attester and smoke-test scripts. README covers architecture, trust assumptions, how it compares, and how to run it locally.

## Access instructions (<=300)
No login. Solana devnet (Tempo payouts on Tempo testnet). Open the console, click "Use demo wallet" (or Phantom on devnet), then "Get test funds". Lock zenZEC, buy an item, repay, then drag Risk desk to -60% to see the keeper liquidate. Merchant portal: /merchant. Tempo payout audit: /audit
