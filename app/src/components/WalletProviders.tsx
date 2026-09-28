"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { DEPLOYMENT } from "@/lib/hodlpay";
import { DemoWalletAdapter } from "@/lib/demoWallet";

export default function WalletProviders({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new DemoWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={DEPLOYMENT.rpc} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
