# Mainnet beta runbook

A capped beta with real USDC, SOL and zenZEC. The program is the `mainnet` build: prices come from Pyth only (the keeper price path is compiled out), and the protocol account caps each purchase and total debt. The contract is unaudited, so caps stay small and the beta is invite-only.

## 1. What to fund

Program size: 498,928 bytes (`mainnet` build). Deployed with `--max-len 650000` so upgrades up to 650 KB need no `program extend`.

| Wallet | SOL | USDC | Where it goes |
|---|---|---|---|
| Admin (deployer) | 6.5 | | 3.30 SOL locked as program rent (recoverable only by closing the program); 2.54 SOL held by the deploy buffer and refunded when the deploy finishes; about 0.05 SOL in write fees; about 0.03 SOL for the bootstrap accounts |
| Admin | | liquidity + reserve | `LIQUIDITY_USDC` goes into the LP pool as the first LP: it earns 70% of fees and can be withdrawn while idle. `RESERVE_USDC` is the first-loss reserve: it only leaves the pool to cover bad debt, there is no withdraw instruction |
| Keeper (hot wallet) | 0.3 | float | Pays fees for Pyth refreshes, collections and liquidations. Fronts USDC for collections and liquidations and receives collateral worth 5% more; sell that collateral back to USDC from time to time |

Two sizes:

| | Minimum | Recommended |
|---|---|---|
| `MAX_LOAN_USDC` (per purchase) | 100 | 300 |
| `MAX_TOTAL_DEBT_USDC` | 500 | 3,000 |
| `LIQUIDITY_USDC` (at least total debt) | 500 | 3,000 |
| `RESERVE_USDC` (10% of total debt) | 50 | 300 |
| Keeper USDC float | 100 | 500 |
| **USDC total** | **650** | **3,800** |
| **SOL total** (admin + keeper) | **6.8** | **6.8** |

Shoppers bring their own collateral: a $40 purchase with the first installment paid at checkout needs $30 of credit, which is $60 of SOL at the 50% LTV tier.

## 2. Keys

| Key | Holds | Lives |
|---|---|---|
| Admin `~/.config/solana/hodlpay-mainnet-admin.json` | Config admin (fee, assets, split, caps, `claim_revenue`), upgrade authority, first LP | Offline. The config admin cannot be transferred, so back up the seed phrase on paper |
| Keeper | Nothing privileged: collections, liquidations and Pyth refreshes are permissionless | Vercel env `ADMIN_SECRET_KEY` of the mainnet project |
| Treasury | Receives `claim_revenue` payouts | Any wallet you control, ideally a Squads vault |
| Program `protocol/target/deploy/hodlpay-keypair.json` | The address `5WWDSNYRjmU3Jp7DywyYgDYtYiBBZ3e8JmcBgS2HxihH` | Same keypair as devnet, so the IDL and app need no change |

```bash
solana-keygen new -o ~/.config/solana/hodlpay-mainnet-admin.json
solana-keygen new --no-bip39-passphrase -o app/.hodlpay/keys/mainnet-keeper.json
```

Use a mainnet RPC with your Helius key: `export MAINNET_RPC="https://mainnet.helius-rpc.com/?api-key=…"`.

## 3. Build

```bash
cd protocol
cargo test -p hodlpay                       # 15 tests, including the Pyth-only mainnet build
cargo build-sbf --manifest-path programs/hodlpay/Cargo.toml --features mainnet --sbf-out-dir target/mainnet
strings target/mainnet/hodlpay.so | grep -c "Keeper prices are disabled"   # 1 = mainnet build
solana-keygen pubkey target/deploy/hodlpay-keypair.json                     # 5WWD…xihH
```

## 4. Deploy

```bash
solana program deploy target/mainnet/hodlpay.so \
  --program-id target/deploy/hodlpay-keypair.json \
  --max-len 650000 \
  -k ~/.config/solana/hodlpay-mainnet-admin.json \
  -u "$MAINNET_RPC" --with-compute-unit-price 50000 --max-sign-attempts 60 --use-rpc
solana program show 5WWDSNYRjmU3Jp7DywyYgDYtYiBBZ3e8JmcBgS2HxihH -u "$MAINNET_RPC"
```

If the deploy stops halfway, `solana program show --buffers -k <admin>` lists the buffer; resume with `--buffer <address>` or reclaim it with `solana program close <buffer>`.

## 5. Bootstrap

Creates the config, the SOL and zenZEC collateral tiers, the 70/20/10 split with caps, seeds the reserve and deposits liquidity. It refuses to run on mainnet unless every money parameter below is set, checks the admin wallet holds the USDC it will deposit, and never mints.

```bash
cd app
HODLPAY_CLUSTER=mainnet HODLPAY_RPC="$MAINNET_RPC" \
ADMIN_KEYPAIR=~/.config/solana/hodlpay-mainnet-admin.json \
USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
ZEC_MINT=JDt9rRGaieF6aN1cJkXFeUmsy7ZE4yY3CZb8tVMXVroS \
TREASURY=<treasury wallet> \
MAX_LOAN_USDC=300 MAX_TOTAL_DEBT_USDC=3000 RESERVE_USDC=300 LIQUIDITY_USDC=3000 \
npx tsx scripts/bootstrap.ts
```

It writes `app/src/lib/hodlpay/deployment.mainnet.json` with the public RPC only. Commit it.

## 6. App

A second Vercel project, so the devnet demo stays as it is.

```bash
cd app
npx vercel project add hodlpay-beta
# Environment variables of hodlpay-beta (Production):
#   NEXT_PUBLIC_HODLPAY_CLUSTER = mainnet
#   SOLANA_RPC                  = <MAINNET_RPC>
#   ADMIN_SECRET_KEY            = <contents of mainnet-keeper.json>
#   CRON_SECRET                 = <openssl rand -hex 24>
VERCEL_ORG_ID=<team id> VERCEL_PROJECT_ID=<hodlpay-beta id> npx vercel deploy --prod --yes
```

`NEXT_PUBLIC_HODLPAY_CLUSTER=mainnet` hides the faucet, demo wallet, stress test, demo catalog, Tempo rail and audit page (the Tempo rail stays on Tempo testnet). Shoppers pay real merchants from Scan to pay or a merchant's payment link.

## 7. Keeper

`.github/workflows/keeper-mainnet.yml` calls `/api/cron/keeper` every 10 minutes: refreshes Pyth prices, liquidates positions past their threshold and collects overdue installments. It stays idle until these are set in the GitHub repository settings:

- Variable `HODLPAY_MAINNET_URL` = `https://hodlpay-beta.vercel.app`
- Secret `HODLPAY_MAINNET_CRON_SECRET` = the same `CRON_SECRET`

Fund the keeper wallet with 0.3 SOL and the USDC float before the first purchase.

## 8. First real transactions

1. Merchant: open `/merchant` on the beta site, set a Solana payout wallet, create a $20 payment link.
2. Shopper: lock about $60 of SOL in the console, open the link, pay in 4.
3. Check: the merchant wallet received $20 minus 1.5%; the Lend card shows protocol revenue and the reserve growing; the purchase appears in the merchant's sales.
4. Repay the next installment on time and confirm the credit ladder moves.

Prefer purchases by people other than the team: they are the evidence that matters.

## 9. Operating

- **Change caps or the split**: re-run the bootstrap with new values; once the reserve and liquidity are in, it needs no USDC.
- **Pause new purchases**: re-run with `MAX_TOTAL_DEBT_USDC=0.000001`. Repayments, collections and liquidations continue. (`0` means no cap.)
- **Claim revenue**: `claim_revenue(amount)`, signed by the admin, pays from the treasury balance to the treasury's USDC account (create that token account first).
- **Upgrade authority**: before raising caps, move it to a Squads multisig:
  `solana program set-upgrade-authority 5WWDSNYRjmU3Jp7DywyYgDYtYiBBZ3e8JmcBgS2HxihH --new-upgrade-authority <squads vault> --skip-new-upgrade-authority-signer-check -k <admin> -u "$MAINNET_RPC"`
- **Watch**: keeper SOL and USDC balances, the GitHub Actions run history, and positions near their margin threshold.
