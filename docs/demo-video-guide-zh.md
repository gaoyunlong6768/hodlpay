# Demo 视频录制指南（中文）

视频里的旁白是英文（规则要求提交内容为英文），由电脑合成，你不用开口。你只需要按下面 9 段**录无声的屏幕**，录完交给 Cursor 里的助手，它会把英文配音和画面拼成成片（约 2:45）。

英文台词原文见 `docs/demo-video-script.md`，配音文件在 `~/Desktop/gao/hodlpay-video/voice/1.aiff … 9.aiff`，可以先听一遍。

## 怎么录

1. 打开专注模式（勿扰），关掉通知。
2. 用存着 demo wallet `FRy8…` 的浏览器打开 [hodlpay.vercel.app](https://hodlpay.vercel.app)，全屏，页面缩放 110%–125%。
3. 按 **⌘⇧5** → 选"录制所选部分"，框住浏览器窗口 → "选项"里**麦克风选"无"**。
4. **每段录一个文件**，录完按菜单栏的停止键。按段号重命名为 `1.mov` … `9.mov`，放进 `~/Desktop/gao/hodlpay-video/clips/`。
5. 每段画面**至少**录到下面写的时长。操作慢、多录几秒都没关系，拼接时会把画面加速或裁剪到和配音对齐；录得太短才是问题。
6. 录错了就重录这一段，覆盖同名文件即可。

## 录之前

- Purchases 里能看到两笔 "Installment 1 collected from collateral"（Coffee beans、Coffee subscription）。
- 钱包 USDC 少于 1,500 时，先按 **Get test funds**。
- Risk desk 滑块在 0。
- 第二个标签页打开 `/audit`。
- **第 8 段（压力测试）会清算这个钱包，必须最后录。**

## 9 段

**第 1 段 · 开场（至少 9 秒）**
- 操作：停在控制台顶部，让画面里看到 devnet 标记、实时价格、demo wallet。不点任何东西。
- 配音意思：这是 HodlPay，运行在 Solana devnet 上。你看到的每个按钮都会向我们的合约发送真实交易。

**第 2 段 · 锁抵押品（至少 18 秒）**
- 操作：在锁仓卡片选 zenZEC，输入 2，点锁定，等交易确认。然后鼠标指一下 Credit line（信用额度）卡片。
- 配音意思：SOL 最多借到价值的 50%，zenZEC 40%，因为它流动性较差。不用申请、不要个人信息，抵押品就是信用审核。第一期在结账时就付了，所以只需要为剩下三期锁抵押品。

**第 3 段 · 商户付款链接（至少 23 秒）**
- 操作：打开 `/merchant`，选 Kinfolk Studio，让画面停在链接、二维码和嵌入按钮上 → 点 **Open checkout** → 点 **Pay $310 today**，等成功 → 回到 `/merchant` 点刷新，这笔销售出现。
- 配音意思：商户用一个链接或按钮就能接入。商户立刻收到 $1,221.40，也就是 $1,240 减去 1.5% 手续费，用 USDC 支付。我今天在同一笔交易里付四分之一，剩下的每两周付一次，零利息。

**第 4 段 · 按时还款提额（至少 21 秒）**
- 操作：回控制台，还 Kinfolk 的下一期（$310），账本出现 "Paid early, so no credit for it…"。→ 控制台切到 **Simulation**（模拟）→ 锁 25 SOL → 买 Walnut desk（$1,240）→ 点 **+14 days** → 还现在到期的 $310 → 账本出现 "Credit level 1 of 4"，按时还款进度条变满一格。
- 配音意思：提前还款永远免费，但只有到期前一周内的还款才累积信用，所以没人能一口气刷出记录。每按时还 $250，最高借款比例提高 2.5 个百分点，最多提高 10 个。记录在链上，绑定钱包，不绑定姓名。

**第 5 段 · 任何 Solana Pay 商户（至少 23 秒）**
- 操作：在 `/merchant` 往下滚到 **Solana Pay point of sale**，点 **Show Solana Pay code**（$42.50）→ 点 **Pay it with HodlPay here**，完成付款 → 切回来，卡片变成 "Paid · verified by @solana/pay"。
- 配音意思：这是一个普通的 Solana Pay 收款码，商店本来就在用。HodlPay 用普通 USDC 转账全额付款，所以收银系统用 Solana Pay 自己的库就能验证，根本不知道我们存在。我分四期付；因为这家店没签约，1.5% 手续费算在我的分期里。

**第 6 段 · Tempo 结算（至少 16 秒）**
- 操作：控制台结账卡片里选 Bluebottle，结算方式切到 **Tempo**，结账 → 点 Tempo 交易链接 → 切到 `/audit` 标签页。
- 配音意思：这个商户想在 Tempo 上收款。每笔付款要 3 个独立验证方里的 2 个签名，每次结账只付一次，并有每日上限。这个页面会根据 Solana 上的结账记录重新核对每一笔 Tempo 付款。

**第 7 段 · 逾期真实发生（至少 16 秒）**
- 操作：滚到 Purchases，指着 Coffee beans 和 Coffee subscription 上的 "Installment 1 collected from collateral" → 点账本里 "Installment #1 … was overdue: the keeper paid …" 那一行，打开链上交易。
- 配音意思：这两期我是故意没还的。三天宽限期一结束，keeper 就从我的抵押品里收走了这两期，外加 1% 滞纳金。没有催收，没有坏账，我的信用等级也清零了。

**第 8 段 · 压力测试（至少 22 秒，最后录）**
- 操作：把 Risk desk 滑块拖到约 −65% 松手 → 指一下出现的保证金警告 → 点 **Run keeper: partial liquidation** → 等清算完成 → 把滑块拖回 0。
- 配音意思：现在 SOL 和 ZEC 暴跌。先是保证金警告，告诉你要还多少或补多少。越过清算线后，keeper 最多替你还一半欠款，以 5% 折扣拿走抵押品，并抵扣接下来的分期。

**第 9 段 · 收尾（至少 17 秒）**
- 操作：停在 Lend（出借）卡片，让画面里看到 fees earned、Protocol revenue、First-loss reserve。
- 配音意思：出借人为每笔消费出资，拿 70% 的手续费；合约把 20% 给 HodlPay，10% 放进先承担坏账的准备金。Solana 负责信贷，Tempo 负责结算，Zcash 作为抵押品。这就是 HodlPay。

> 第 8 段因为会清算钱包，录制顺序是 1→7、9，最后录 8；拼接时仍按 1→9 的顺序。
