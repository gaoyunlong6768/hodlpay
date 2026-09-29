# Technical demo script (2:45)

录制建议：屏幕录制线上站点 [hodlpay.vercel.app](https://hodlpay.vercel.app)（全屏浏览器 + 可选终端窗口），英文旁白。规则要求演示视频不超过 3 分钟，按 2:45 准备，留 15 秒余量。

## Before recording

1. 在 10 月 1 日 23:00（北京时间）之后录。那时 demo wallet `FRy8…aeKvJ1pjLiE` 的两笔逾期分期（Coffee beans $10、Coffee subscription $78）已经被 keeper 从抵押品扣款，账本里有真实记录。录之前先确认 Purchases 里出现 “Installment 1 collected from collateral”。
2. 用存着这个 demo wallet 的浏览器（不要清浏览器数据）。钱包里 USDC 不够时先按 **Get test funds**。
3. Risk desk slider 在 0。第二个标签页打开 `/audit`。
4. 最后一段压力测试会清算这个钱包的仓位（也会把信用等级清零），所以放在最后录，录完就不要再用它演示逾期扣款了。

## Shot list

**0:00 – 0:10 · Setup**

Show the console header: devnet, live oracle prices, the demo wallet.
"This is HodlPay live on Solana devnet. Every button you'll see sends a real transaction to our Anchor program."

**0:10 – 0:25 · Lock collateral**

Lock 2 zenZEC (enough for the $1,240 desk; if credit is still short, the checkout page locks the rest itself). Point at the Credit line card.
"SOL gets a 50% max loan-to-value, zenZEC 40% because it's thinner. No application and no personal data: the collateral is the credit check."

**0:25 – 0:48 · A merchant payment link**

Open `/merchant`, pick Kinfolk Studio, show the link, QR code and embed button. Click **Open checkout**, then **Pay $310 today**.
"Merchants integrate with a link or a button. The merchant is paid $1,221.40 right away, the full $1,240 minus a 1.5% fee, in USDC. I pay a quarter today in the same transaction, and the rest every two weeks at zero interest."

Back on `/merchant`, press refresh: the sale appears with the amount received.

**0:48 – 1:05 · Pay on time, earn a higher limit**

Back in the console, repay the next Kinfolk installment ($310). Point at the ledger line "Credit level 1 of 4" and the On-time credit bar.
"Every $250 repaid on time raises my max loan-to-value by 2.5 points, up to 10. Loyal customers need less collateral. The record lives on-chain, tied to the wallet, not to my name."

**1:05 – 1:28 · Any Solana Pay merchant, no integration**

On `/merchant`, scroll to **Solana Pay point of sale**, press **Show Solana Pay code** ($42.50). Press **Pay it with HodlPay here** (or scan it from `/scan` on a phone, which films better), pay, then switch back: the card turns to "Paid · verified by @solana/pay".
"This is a plain Solana Pay code, the kind shops already use. HodlPay pays it in full with a normal USDC transfer, so the point of sale verifies it with Solana Pay's own library and never knows we exist. I pay in four; because this shop didn't sign up, the 1.5% fee is in my plan instead."

**1:28 – 1:48 · Checkout on Tempo**

Pick Bluebottle, switch the rail to Tempo, check out. Click the Tempo transaction link, then switch to the `/audit` tab.
"This merchant wants to be paid on Tempo. Two of three independent attesters must sign each payout, once per checkout, under a daily cap. And this page re-derives every Tempo payout from its Solana checkout."

**1:48 – 2:05 · A missed payment, for real**

Scroll to Purchases: Coffee beans and Coffee subscription, each marked "Installment 1 collected from collateral". Click the ledger line "Installment #1 … was overdue: the keeper paid …" to open the transaction.
"I skipped these two payments on purpose. Three days later, our hourly keeper collected exactly those installments from my collateral, plus a 1% late fee. No debt collectors, no bad debt, and my credit level reset."

**2:05 – 2:35 · Crash test**

Drag the Risk desk slider to about −65% and release. Point at the margin banner, then click **Run keeper: partial liquidation**.
"Now SOL and ZEC crash. First a margin alert with exactly how much to repay or top up. Past the liquidation line, the keeper repays at most half the debt, takes collateral at a 5% bonus and credits it to the next installments. Credit levels never move these lines."

Reset the slider.

**2:35 – 2:45 · Close**

Show the Lend card: share price and fees earned.
"LPs fund every purchase and earn the fees. Solana for credit, Tempo for settlement, Zcash as collateral. That's HodlPay."

## Optional terminal cut (10 seconds)

Show `cargo test -p hodlpay` (10 LiteSVM tests passing, including the credit ladder, overdue collection, the Pyth price refresh and the real mainnet zenZEC mint). If you add it, cut the Lend card shot to stay under 3 minutes.
