# Technical demo script (about 3 minutes)

录制建议：屏幕录制 console（全屏浏览器 + 可选终端窗口），英文旁白。录制前先准备好环境，按下面的清单操作，避免现场等待。

## Before recording

1. Validator (or devnet) running, `npm run bootstrap` done, `npm run dev` running.
2. Open the console in a fresh browser profile so the demo wallet starts empty.
3. Risk desk slider at 0, pool seeded.
4. Open a second tab on the Tempo explorer for the settlement contract.

## Shot list

**0:00 – 0:20 · Setup**

Show the console header: on-chain mode, live oracle prices.
"This is the HodlPay console running against our Anchor program. Prices are live from Pyth and posted on-chain by our keeper."

Click **Use demo wallet**, then **Get test funds**.
"I'm using a demo wallet with test USDC, SOL and zenZEC. Any Solana wallet works."

**0:20 – 0:45 · Lock collateral**

Lock 4 SOL, switch to zenZEC and lock 2. Point at the credit line card.
"SOL has a 50% max loan-to-value, zenZEC 40% because it's thinner. The credit limit is computed on-chain from both collateral slots."

Click **Holding ZEC? Bring it from Zcash** under the zenZEC amount.
"If you hold shielded ZEC, you send it to your Zenrock deposit address and zenZEC lands here in about five minutes, one to one. Your shielded history stays private; only the collateral you lock here is public. Instead of an interest-bearing loan, ZEC holders pay at checkout and repay in four, interest-free, without selling. On mainnet the vault takes Zenrock's real zenZEC mint as is; our tests run against that exact mint."

Click the transaction link in the ledger to show it on the explorer.

**0:45 – 1:15 · A merchant payment link**

Open `/merchant`, pick Kinfolk Studio, show the generated link, QR code and embed button. Click **Open checkout**.
"Merchants integrate with a link or a button. This is the checkout their customer sees."

On the checkout page, press **Pay $310 today**.
"The merchant gets paid right away: $1,240 minus the 3% fee, in USDC. I pay a quarter today in the same transaction, and the other three every two weeks, zero interest."

Back on `/merchant`, press refresh: the sale appears with the amount received.

**1:15 – 1:45 · Checkout on Tempo**

Pick Bluebottle, switch the rail to Tempo, check out.
"This merchant wants to be paid on Tempo. The Solana transaction carries a memo with their Tempo address. Three independent attesters each re-read that transaction from Solana and sign the exact payout; our Tempo contract pays only with two of those signatures, once per checkout, under a daily cap."

Click the Tempo transaction link and show the transfer on the Tempo explorer. Then open `/audit`.
"And you don't have to trust us: this page re-derives every Tempo payout from its Solana checkout. All payouts since launch match."

**1:45 – 2:05 · Repay, or miss a payment**

Repay the next installment on one purchase, then point at an older purchase with an unpaid installment and its red note.
"Repayments go back into the pool and release the merchant fee to LPs. Miss one, and three days later the keeper collects just that installment from your collateral, plus a 1% late fee. No debt collectors, no credit score damage, and the rest of your position is untouched."

(If the wallet has no overdue purchase yet, use a demo wallet with a purchase older than 3 days, or show the ledger line "Installment #1 … was overdue: the keeper paid … from your collateral".)

**2:05 – 2:40 · Risk**

Drag the risk desk slider to about −65%, release.
"Now SOL and ZEC crash. First the position crosses the margin line and the console tells the user exactly how much to repay or top up. Past the liquidation line, the keeper steps in."

Click **Run keeper: partial liquidation**.
"It repays at most half the debt, takes collateral at a 5% bonus, and credits the payment to the user's next installments. The position is healthy again, and the pool never took a loss."

Reset the slider.

**2:40 – 3:00 · Liquidity pool and close**

Supply 500 USDC in the Lend card, show share price and fees earned.
"Liquidity providers fund all of this and earn the merchant and late fees through a rising share price. Everything you saw is on-chain: an Anchor program on Solana, a settlement contract on Tempo, and zenZEC as Zcash collateral. That's HodlPay."

## Optional terminal cut (10 seconds)

Show `cargo test -p hodlpay` (8 LiteSVM tests passing, including overdue collection, the Pyth price refresh and the real mainnet zenZEC mint) and `npm run smoke` output ending with the LP withdrawal.
