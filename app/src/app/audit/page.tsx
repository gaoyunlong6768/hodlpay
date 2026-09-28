import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import TempoAudit from "@/components/TempoAudit";

export const metadata: Metadata = {
  title: "HodlPay · Tempo settlement audit",
  description: "Every HodlPay stablecoin payout on Tempo, reconciled against the Solana checkout that financed it.",
};

export default function AuditPage() {
  return (
    <main className="flex-1">
      <SiteHeader />
      <TempoAudit />
    </main>
  );
}
