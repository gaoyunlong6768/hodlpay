import type { Metadata } from "next";
import Link from "next/link";
import PayCheckout from "@/components/PayCheckout";
import SiteHeader from "@/components/SiteHeader";
import { parsePay } from "@/lib/paylink";

export const metadata: Metadata = {
  title: "Pay in 4 with HodlPay",
  description: "Pay any merchant in stablecoins with a crypto-backed credit line. 4 interest-free installments.",
};

export default async function PayPage({ searchParams }: PageProps<"/pay">) {
  const request = parsePay(await searchParams);
  return (
    <main className="flex-1">
      <SiteHeader />
      {"error" in request ? (
        <div className="mx-auto w-full max-w-xl px-5 pb-24 pt-10">
          <div className="receipt p-6">
            <h1 className="font-display text-3xl">This payment link is not valid</h1>
            <p className="mt-2 text-ink-soft">{request.error}</p>
            <Link href="/merchant" className="mt-5 inline-block bg-ink px-4 py-2.5 text-sm font-medium text-paper">
              Create a payment link
            </Link>
          </div>
        </div>
      ) : (
        <PayCheckout request={request} />
      )}
    </main>
  );
}
