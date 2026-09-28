import Link from "next/link";
import { DEPLOYMENT } from "@/lib/hodlpay";

export default function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
      <Link href="/" className="font-display text-2xl tracking-tight">
        Hodl<span className="italic">Pay</span>
      </Link>
      <nav className="num flex items-center gap-5 text-xs uppercase tracking-widest text-ink-soft">
        <Link href="/#how" className="hidden hover:text-ink sm:inline">
          How it works
        </Link>
        <Link href="/#console" className="hidden hover:text-ink sm:inline">
          Console
        </Link>
        <Link href="/merchant" className="hover:text-ink">
          Merchants
        </Link>
        <span className="border border-ink px-2.5 py-1 text-ink">{DEPLOYMENT.cluster}</span>
      </nav>
    </header>
  );
}
