import {
  BaseSignerWalletAdapter,
  WalletNotConnectedError,
  WalletReadyState,
  isVersionedTransaction,
  type WalletName,
} from "@solana/wallet-adapter-base";
import { Keypair, type Transaction, type TransactionVersion, type VersionedTransaction } from "@solana/web3.js";

export const DemoWalletName = "HodlPay Demo Wallet" as WalletName<"HodlPay Demo Wallet">;
const STORAGE_KEY = "hodlpay.demoWallet";

const ICON =
  "data:image/svg+xml;base64," +
  (typeof btoa === "function"
    ? btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#1a1a17"/><path d="M8 10h16M8 16h16M8 22h10" stroke="#f4efe4" stroke-width="2.5"/></svg>',
      )
    : "");

/**
 * Browser-only test wallet so judges can try HodlPay without installing a
 * wallet. The key lives in localStorage: never use it for real funds.
 */
export class DemoWalletAdapter extends BaseSignerWalletAdapter {
  name = DemoWalletName;
  url = "https://github.com/anza-xyz/wallet-adapter";
  icon = ICON;
  supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(["legacy", 0]);
  private _keypair: Keypair | null = null;

  get connecting() {
    return false;
  }
  get publicKey() {
    return this._keypair?.publicKey ?? null;
  }
  get readyState() {
    return typeof window === "undefined" ? WalletReadyState.Unsupported : WalletReadyState.Loadable;
  }

  async connect() {
    // Emitting synchronously races the provider's effect setup and the event gets dropped.
    await new Promise((r) => setTimeout(r, 0));
    const saved = localStorage.getItem(STORAGE_KEY);
    this._keypair = saved ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(saved))) : Keypair.generate();
    if (!saved) localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this._keypair.secretKey)));
    this.emit("connect", this._keypair.publicKey);
  }

  async disconnect() {
    this._keypair = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (!this._keypair) throw new WalletNotConnectedError();
    if (isVersionedTransaction(tx)) tx.sign([this._keypair]);
    else tx.partialSign(this._keypair);
    return tx;
  }
}
