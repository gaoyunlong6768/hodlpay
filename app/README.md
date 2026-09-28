# HodlPay console

Next.js app for HodlPay: the landing page, the live console (on-chain and simulation modes), API routes and ops scripts. See the [root README](../README.md) for architecture and setup.

| Path | Purpose |
| --- | --- |
| `src/components/Console.tsx` | Console UI: vault, credit line, checkout, installments, risk desk, lend, ledger |
| `src/components/PayCheckout.tsx`, `src/app/pay/` | Hosted checkout for merchant payment links |
| `src/components/MerchantPortal.tsx`, `src/app/merchant/` | Merchant portal: payouts, payment links, QR, sales |
| `src/lib/paylink.ts` | Payment link format and validation |
| `src/lib/hodlpay/` | Program client: PDAs, instruction builders, account decoding, generated IDL, deployment and Tempo config |
| `src/lib/useOnchain.ts` | Wallet-connected state and actions |
| `src/lib/server/` | Admin keypair, faucet, price posting, liquidation, Tempo relayer |
| `src/app/api/` | `faucet`, `keeper`, `prices`, `risk/shock`, `tempo/settle`, `tempo/settlements` |
| `scripts/` | `bootstrap`, `keeper`, `smoke`, `tempo-deploy` (run with `npm run <name>`) |
