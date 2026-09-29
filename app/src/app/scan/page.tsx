import type { Metadata } from "next";
import ScanQr from "@/components/ScanQr";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Scan to pay in 4 · HodlPay",
  description: "Pay any Solana Pay merchant in 4 interest-free installments with a crypto-backed credit line.",
};

export default function ScanPage() {
  return (
    <main className="flex-1">
      <SiteHeader />
      <ScanQr />
    </main>
  );
}
