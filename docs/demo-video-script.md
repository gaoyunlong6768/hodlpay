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

Click the transaction link in the ledger to show it on the explorer.

**0:45 – 1:15 · A merchant payment link**

Open `/merchant`, pick Kinfolk Studio, show the generated link, QR code and embed button. Click **Open checkout**.
"Merchants integrate with a link or a button. This is the checkout their customer sees."

On the checkout page, press **Buy now**.
"The merchant gets paid right away: $1,240 minus the 3% fee, in USDC. I get four installments, zero interest."

Back on `/merchant`, press refresh: the sale appears with the amount received.

**1:15 – 1:45 · Checkout on Tempo**

Pick Bluebottle, switch the rail to Tempo, check out.
"This merchant wants to be paid on Tempo. The Solana transaction carries a memo with their Tempo address. Our relayer verifies it and our settlement contract pays them in AlphaUSD with transferWithMemo, keyed by the Solana signature, so it can never be paid twice."

Click the Tempo transaction link and show the transfer on the Tempo explorer.

**1:45 – 2:05 · Repay**

Pay the first installment, then press **Pay off** on the other loan.
"Repayments go back into the pool, and each one releases its share of the merchant fee to LPs. Pay early at no cost; past a three-day grace period there's a 1% late fee."

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

Show `cargo test -p hodlpay` (5 LiteSVM tests passing, including the Pyth price refresh) and `npm run smoke` output ending with the LP withdrawal.
