"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { DemoWalletName } from "@/lib/demoWallet";
import { DEPLOYMENT, IS_MAINNET, explorerAddress } from "@/lib/hodlpay";
import type { Balances } from "@/lib/useOnchain";
import { usd, type AssetId } from "@/lib/engine";

/** A saved wallet is being reconnected; the adapter clears the selection if that fails. */
export function useWalletRestoring() {
  const { wallet, publicKey, connecting } = useWallet();
  const ready = wallet?.readyState === WalletReadyState.Installed || wallet?.readyState === WalletReadyState.Loadable;
  return connecting || (ready && !publicKey);
}

export function WalletBar({
  balances,
  busy,
  onFaucet,
}: {
  balances: Balances | null;
  busy: string | null;
  onFaucet: () => void;
}) {
  const { wallets, wallet, publicKey, select, connect, disconnect } = useWallet();
  const connecting = useWalletRestoring();
  const [open, setOpen] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    if (wallet && !publicKey && pending.current) {
      pending.current = false;
      connect().catch(() => {});
    }
  }, [wallet, publicKey, connect]);

  const choose = (name: WalletName) => {
    pending.current = true;
    select(name);
    setOpen(false);
  };

  const addr = publicKey?.toBase58();
  const extensions = wallets.filter((w) => w.adapter.name !== DemoWalletName);
  return (
    <div className="receipt flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
      {addr ? (
        <>
          <span className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-mint" />
            <span className="font-medium">{wallet?.adapter.name}</span>
            <a
              className="num text-xs text-ink-soft underline decoration-dotted"
              href={explorerAddress(addr)}
              target="_blank"
              rel="noreferrer"
            >
              {addr.slice(0, 4)}…{addr.slice(-4)}
            </a>
          </span>
          {balances ? (
            <span className="num flex flex-wrap gap-x-4 gap-y-1 whitespace-nowrap text-xs text-ink-soft">
              <span>{balances.SOL.toFixed(3)} SOL</span>
              <span>{balances.zenZEC.toFixed(4)} zenZEC</span>
              <span>{usd(balances.USDC)} USDC</span>
            </span>
          ) : (
            <Skel className="w-56" />
          )}
          <span className="ml-auto flex gap-2">
            {!IS_MAINNET && (
              <button
                onClick={onFaucet}
                disabled={!!busy}
                className="num border border-ink px-3 py-1.5 text-xs transition hover:bg-paper-2 disabled:opacity-40"
              >
                {busy === "faucet" ? "Sending…" : "Get test funds"}
              </button>
            )}
            <button onClick={() => disconnect()} className="num px-2 py-1.5 text-xs text-ink-soft underline">
              disconnect
            </button>
          </span>
          <p className="basis-full text-[11px] text-ink-soft">
            {IS_MAINNET
              ? "Mainnet beta: real funds, unaudited contract, per-purchase and total-debt caps."
              : wallet?.adapter.name === DemoWalletName
              ? `Demo wallet: a real Solana ${DEPLOYMENT.cluster} wallet whose key is kept in this browser and signs without popups. Test funds only; clearing site data creates a new one.`
              : `Real transactions on Solana ${DEPLOYMENT.cluster}: switch your wallet to ${DEPLOYMENT.cluster} (in Phantom: Settings → Developer Settings → Testnet Mode), then press Get test funds.`}
          </p>
        </>
      ) : (
        <>
          <span className="text-sm text-ink-soft">
            {connecting && wallet ? (
              `Reconnecting ${wallet.adapter.name}…`
            ) : IS_MAINNET ? (
              "Mainnet beta: real funds, unaudited contract. Connect Phantom, Solflare or Backpack."
            ) : (
              <>
                Every action is a real transaction on Solana {DEPLOYMENT.cluster}.{" "}
                <span className="text-ink">Demo wallet</span>: created in this browser, no extension or popups, test
                funds only. <span className="text-ink">Connect wallet</span>: Phantom, Solflare or Backpack set to{" "}
                {DEPLOYMENT.cluster}.
              </>
            )}
          </span>
          <span className="relative ml-auto flex gap-2">
            {!IS_MAINNET && (
              <button
                onClick={() => choose(DemoWalletName)}
                disabled={connecting}
                className="bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-mint"
              >
                {connecting ? "Connecting…" : "Use demo wallet"}
              </button>
            )}
            <button onClick={() => setOpen((o) => !o)} disabled={connecting} className="border border-ink px-4 py-2 text-sm">
              Connect wallet
            </button>
            {open && (
              <div className="absolute right-0 top-full z-10 mt-1 min-w-56 border border-ink bg-paper">
                {extensions.length ? (
                  extensions.map((w) => (
                    <button
                      key={w.adapter.name}
                      onClick={() => choose(w.adapter.name)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-paper-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={w.adapter.icon} alt="" className="h-4 w-4" />
                      {w.adapter.name}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-ink-soft">
                    No Solana wallet extension found in this browser.{" "}
                    <a href="https://phantom.com/download" target="_blank" rel="noreferrer" className="underline">
                      Install Phantom
                    </a>{" "}
                    or use the demo wallet.
                  </p>
                )}
              </div>
            )}
          </span>
        </>
      )}
    </div>
  );
}

export function Card({
  title,
  kicker,
  children,
  className = "",
}: {
  title: string;
  kicker: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`receipt h-full p-5 ${className}`}>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="font-display text-2xl">{title}</h3>
        <span className="num text-[10px] uppercase tracking-[0.2em] text-ink-soft">{kicker}</span>
      </div>
      {children}
    </div>
  );
}

/** Placeholder for a number that is still loading. */
export function Skel({ className = "w-16" }: { className?: string }) {
  return <span aria-hidden className={`inline-block h-[0.8em] animate-pulse bg-ink/10 align-middle ${className}`} />;
}

export function PriceTicker({
  label,
  ok,
  prices,
  shock,
}: {
  label: string;
  ok: boolean;
  prices: Record<AssetId, number> | null;
  shock: number;
}) {
  return (
    <div className="num flex flex-wrap items-center gap-x-4 gap-y-1 border border-rule bg-paper-2/60 px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-mint" : "bg-amber"}`} />
        {label}
      </span>
      <span>SOL {prices ? usd(prices.SOL) : <Skel className="w-12" />}</span>
      <span>ZEC {prices ? usd(prices.zenZEC) : <Skel className="w-12" />}</span>
      {shock !== 0 && (
        <span className={shock < 0 ? "text-vermilion" : "text-mint"}>
          shock {(shock * 100).toFixed(0)}%
        </span>
      )}
    </div>
  );
}

export function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-ink-soft">{k}</span>
      <span className={`num ${strong ? "font-medium" : ""}`}>{v}</span>
    </div>
  );
}
