"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { BROWSER_RPC } from "@/lib/hodlpay";
import { DemoWalletAdapter } from "@/lib/demoWallet";

export default function WalletProviders({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new DemoWalletAdapter()], []);
  const endpoint = useMemo(() => BROWSER_RPC.endpoint(), []);
  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed", wsEndpoint: BROWSER_RPC.wsEndpoint }}>
      <WalletProvider wallets={wallets} autoConnect>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}
