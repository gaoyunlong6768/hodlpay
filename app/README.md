# HodlPay console

Next.js app for HodlPay: the landing page, the live console (on-chain and simulation modes), API routes and ops scripts. See the [root README](../README.md) for architecture and setup.

| Path | Purpose |
| --- | --- |
| `src/components/Console.tsx` | Console UI: vault, credit line, checkout, installments, risk desk, lend, ledger |
| `src/lib/hodlpay/` | Program client: PDAs, instruction builders, account decoding, generated IDL, deployment and Tempo config |
| `src/lib/useOnchain.ts` | Wallet-connected state and actions |
| `src/lib/server/` | Admin keypair, faucet, price posting, liquidation, Tempo relayer |
| `src/app/api/` | `faucet`, `keeper`, `prices`, `risk/shock`, `tempo/settle` |
| `scripts/` | `bootstrap`, `keeper`, `smoke`, `tempo-deploy` (run with `npm run <name>`) |
