import type { Metadata } from "next";
import MerchantPortal from "@/components/MerchantPortal";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "HodlPay for merchants",
  description: "Accept crypto-backed Buy Now, Pay Later. Paid in full upfront in USDC on Solana or stablecoins on Tempo.",
};

export default function MerchantPage() {
  return (
    <main className="flex-1">
      <SiteHeader />
      <MerchantPortal />
    </main>
  );
}
