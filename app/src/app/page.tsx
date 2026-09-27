import Console from "@/components/Console";

const STEPS = [
  ["Lock", "Deposit SOL or zenZEC into an on-chain vault. You keep the upside."],
  ["Pay", "Check out anywhere. The merchant is paid in full, instantly, in stablecoins."],
  ["Repay", "Four interest-free installments. Top up or repay early any time."],
];

export default function Home() {
  return (
    <main className="flex-1">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <a href="#" className="font-display text-2xl tracking-tight">
          Hodl<span className="italic">Pay</span>
        </a>
        <nav className="num flex items-center gap-5 text-xs uppercase tracking-widest text-ink-soft">
          <a href="#how" className="hidden hover:text-ink sm:inline">
            How it works
          </a>
          <a href="#console" className="hidden hover:text-ink sm:inline">
            Console
          </a>
          <span className="border border-ink px-2.5 py-1 text-ink">Devnet</span>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-10 md:grid-cols-12 md:pt-16">
        <div className="md:col-span-7">
          <p className="num rise mb-5 text-xs uppercase tracking-[0.25em] text-ink-soft">
            Crypto-backed Buy Now, Pay Later
          </p>
          <h1 className="font-display rise text-6xl leading-[0.95] md:text-8xl" style={{ animationDelay: "80ms" }}>
            Spend your crypto.
            <br />
            <span className="italic text-mint">Keep</span> your crypto.
          </h1>
          <p className="rise mt-6 max-w-xl text-lg text-ink-soft" style={{ animationDelay: "160ms" }}>
            HodlPay turns SOL and zenZEC into a stablecoin credit line you can use at any checkout. No selling, no
            taxable event, no credit check. Merchants get paid upfront on Solana or Tempo.
          </p>
          <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
            <a href="#console" className="bg-ink px-5 py-3 text-sm font-medium text-paper transition hover:bg-mint">
              Try the live console
            </a>
            <a href="#how" className="border border-ink px-5 py-3 text-sm font-medium transition hover:bg-paper-2">
              How it works
            </a>
          </div>
        </div>

        <div className="rise md:col-span-5" style={{ animationDelay: "320ms" }}>
          <div className="receipt receipt-edge mx-auto max-w-sm rotate-[1.5deg] px-6 pb-6 pt-7">
            <p className="num text-center text-xs uppercase tracking-[0.35em]">HodlPay receipt</p>
            <div className="dash my-4" />
            <div className="num space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span>SFO → Tokyo</span>
                <span>$860.00</span>
              </div>
              <div className="flex justify-between text-ink-soft">
                <span>Collateral</span>
                <span>12.4 SOL</span>
              </div>
              <div className="flex justify-between text-ink-soft">
                <span>Coins sold</span>
                <span>0</span>
              </div>
              <div className="flex justify-between text-ink-soft">
                <span>Merchant paid</span>
                <span>USDC · instantly</span>
              </div>
            </div>
            <div className="dash my-4" />
            <div className="num grid grid-cols-4 gap-2 text-center text-[11px]">
              {["Today", "+2w", "+4w", "+6w"].map((d, i) => (
                <div key={d}>
                  <div className={`mb-1 h-2 ${i === 0 ? "bg-mint" : "border border-ink/50"}`} />
                  <span className="text-ink-soft">{d}</span>
                  <p>$215</p>
                </div>
              ))}
            </div>
            <p className="font-display mt-5 text-center text-2xl italic">0% interest</p>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto w-full max-w-6xl px-5 pb-20">
        <div className="grid gap-px border border-rule bg-rule md:grid-cols-3">
          {STEPS.map(([t, d], i) => (
            <div key={t} className="bg-paper p-6">
              <p className="num text-xs text-ink-soft">0{i + 1}</p>
              <h3 className="font-display mt-2 text-4xl">{t}</h3>
              <p className="mt-2 text-sm text-ink-soft">{d}</p>
            </div>
          ))}
        </div>
        <div className="num mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[11px] uppercase tracking-widest text-ink-soft">
          <span>Solana · Anchor programs</span>
          <span>Zcash · zenZEC collateral</span>
          <span>Tempo · stablecoin settlement</span>
          <span>Pyth · price oracle</span>
        </div>
      </section>

      <Console />

      <footer className="mx-auto w-full max-w-6xl px-5 pb-10">
        <div className="dash pt-4 num flex justify-between text-[11px] text-ink-soft">
          <span>HodlPay · Colosseum Crypto World&apos;s Fair 2026</span>
          <span>Devnet demo. Not financial advice.</span>
        </div>
      </footer>
    </main>
  );
}
