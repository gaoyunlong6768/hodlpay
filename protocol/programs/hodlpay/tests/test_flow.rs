use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::instruction::{AccountMeta, Instruction},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    hodlpay::{
        constants::*,
        state::{CreditProfile, Loan, Position},
        AddAssetArgs, InitializeArgs,
    },
    litesvm::LiteSVM,
    litesvm_token::{
        get_spl_account, spl_token::state::Account as SplAccount, CreateAssociatedTokenAccount,
        CreateMint, MintTo,
    },
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

const USDC: u64 = 1_000_000;
const SOL: u64 = 1_000_000_000;
const DAY: i64 = 86_400;
const SOL_FEED: [u8; 32] = [7u8; 32];

struct Env {
    svm: LiteSVM,
    admin: Keypair,
    admin_usdc: Pubkey,
    admin_lp: Pubkey,
    usdc: Pubkey,
    sol: Pubkey,
    zec: Pubkey,
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &hodlpay::id()).0
}

fn send(svm: &mut LiteSVM, ix: Instruction, signers: &[&Keypair]) -> Result<(), String> {
    let payer = signers[0].pubkey();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer), &svm.latest_blockhash());
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    let res = svm.send_transaction(tx).map(|_| ()).map_err(|e| format!("{:?}", e.meta.logs));
    svm.expire_blockhash();
    res
}

fn ix(data: impl InstructionData, accounts: impl ToAccountMetas, remaining: &[Pubkey]) -> Instruction {
    let mut metas = accounts.to_account_metas(None);
    metas.extend(remaining.iter().map(|k| AccountMeta::new_readonly(*k, false)));
    Instruction::new_with_bytes(hodlpay::id(), &data.data(), metas)
}

fn credit_pda(owner: &Pubkey) -> Pubkey {
    pda(&[CREDIT_SEED, owner.as_ref()])
}

fn read<T: AccountDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let acc = svm.get_account(key).unwrap();
    T::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn balance(svm: &LiteSVM, key: &Pubkey) -> u64 {
    get_spl_account::<SplAccount>(svm, key).unwrap().amount
}

fn setup() -> Env {
    setup_with(include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/hodlpay.so")))
}

fn setup_with(bytes: &[u8]) -> Env {
    let mut svm = LiteSVM::new();
    svm.add_program(hodlpay::id(), bytes).unwrap();

    let admin = Keypair::new();
    svm.airdrop(&admin.pubkey(), 100 * SOL).unwrap();
    let usdc = CreateMint::new(&mut svm, &admin).decimals(6).send().unwrap();
    let sol = CreateMint::new(&mut svm, &admin).decimals(9).send().unwrap();
    let zec = CreateMint::new(&mut svm, &admin).decimals(8).send().unwrap();

    let config = pda(&[CONFIG_SEED]);
    send(
        &mut svm,
        ix(
            hodlpay::instruction::Initialize {
                args: InitializeArgs {
                    merchant_fee_bps: 300,
                    liquidation_bonus_bps: 500,
                    close_factor_bps: 5_000,
                    installments: 4,
                    installment_interval: 14 * DAY,
                    max_price_age: 300,
                    late_fee_bps: 100,
                    grace_period: 3 * DAY,
                },
            },
            hodlpay::accounts::Initialize {
                admin: admin.pubkey(),
                config,
                usdc_mint: usdc,
                liquidity_vault: pda(&[LIQUIDITY_SEED]),
                lp_mint: pda(&[LP_MINT_SEED]),
                token_program: anchor_spl::token::ID,
                system_program: anchor_lang::system_program::ID,
            },
            &[],
        ),
        &[&admin],
    )
    .unwrap();

    for (mint, max, margin, liq, price, feed) in [
        (sol, 5_000, 6_500, 7_500, 120 * USDC, SOL_FEED),
        (zec, 4_000, 5_500, 6_500, 1_500 * USDC, [0u8; 32]),
    ] {
        send(
            &mut svm,
            ix(
                hodlpay::instruction::AddAsset {
                    args: AddAssetArgs {
                        max_ltv_bps: max,
                        margin_ltv_bps: margin,
                        liquidation_ltv_bps: liq,
                        price_e6: price,
                        pyth_feed_id: feed,
                    },
                },
                hodlpay::accounts::AddAsset {
                    admin: admin.pubkey(),
                    config,
                    mint,
                    asset: pda(&[ASSET_SEED, mint.as_ref()]),
                    vault: pda(&[COLLATERAL_VAULT_SEED, mint.as_ref()]),
                    token_program: anchor_spl::token::ID,
                    system_program: anchor_lang::system_program::ID,
                },
                &[],
            ),
            &[&admin],
        )
        .unwrap();
    }

    let admin_usdc = CreateAssociatedTokenAccount::new(&mut svm, &admin, &usdc).send().unwrap();
    let admin_lp = CreateAssociatedTokenAccount::new(&mut svm, &admin, &pda(&[LP_MINT_SEED])).send().unwrap();
    MintTo::new(&mut svm, &admin, &usdc, &admin_usdc, 100_000 * USDC).send().unwrap();
    let mut env = Env { svm, admin, admin_usdc, admin_lp, usdc, sol, zec };
    let admin = env.admin.insecure_clone();
    liquidity(&mut env, &admin, admin_usdc, admin_lp, 100_000 * USDC, true).unwrap();
    env
}

fn liquidity(env: &mut Env, provider: &Keypair, usdc: Pubkey, lp: Pubkey, amount: u64, deposit: bool) -> Result<(), String> {
    let accounts = hodlpay::accounts::ProvideLiquidity {
        provider: provider.pubkey(),
        config: pda(&[CONFIG_SEED]),
        provider_usdc: usdc,
        provider_lp: lp,
        liquidity_vault: pda(&[LIQUIDITY_SEED]),
        lp_mint: pda(&[LP_MINT_SEED]),
        token_program: anchor_spl::token::ID,
    };
    let i = if deposit {
        ix(hodlpay::instruction::DepositLiquidity { amount }, accounts, &[])
    } else {
        ix(hodlpay::instruction::WithdrawLiquidity { shares: amount }, accounts, &[])
    };
    send(&mut env.svm, i, &[provider])
}

struct User {
    kp: Keypair,
    position: Pubkey,
    sol_ata: Pubkey,
    usdc_ata: Pubkey,
}

fn new_user(env: &mut Env, sol_amount: u64, usdc_amount: u64) -> User {
    let kp = Keypair::new();
    env.svm.airdrop(&kp.pubkey(), 10 * SOL).unwrap();
    let sol_ata = CreateAssociatedTokenAccount::new(&mut env.svm, &kp, &env.sol).send().unwrap();
    let usdc_ata = CreateAssociatedTokenAccount::new(&mut env.svm, &kp, &env.usdc).send().unwrap();
    MintTo::new(&mut env.svm, &env.admin, &env.sol, &sol_ata, sol_amount).send().unwrap();
    if usdc_amount > 0 {
        MintTo::new(&mut env.svm, &env.admin, &env.usdc, &usdc_ata, usdc_amount).send().unwrap();
    }
    let position = pda(&[POSITION_SEED, kp.pubkey().as_ref()]);
    send(
        &mut env.svm,
        ix(
            hodlpay::instruction::OpenPosition {},
            hodlpay::accounts::OpenPosition {
                owner: kp.pubkey(),
                position,
                system_program: anchor_lang::system_program::ID,
            },
            &[],
        ),
        &[&kp],
    )
    .unwrap();
    User { kp, position, sol_ata, usdc_ata }
}

fn move_collateral(env: &mut Env, u: &User, mint: Pubkey, user_token: Pubkey, amount: u64, withdraw: bool) -> Result<(), String> {
    let accounts = hodlpay::accounts::MoveCollateral {
        owner: u.kp.pubkey(),
        config: pda(&[CONFIG_SEED]),
        position: u.position,
        asset: pda(&[ASSET_SEED, mint.as_ref()]),
        vault: pda(&[COLLATERAL_VAULT_SEED, mint.as_ref()]),
        user_token,
        token_program: anchor_spl::token::ID,
        credit: credit_pda(&u.kp.pubkey()),
    };
    let remaining = [pda(&[ASSET_SEED, env.sol.as_ref()]), pda(&[ASSET_SEED, env.zec.as_ref()])];
    let i = if withdraw {
        ix(hodlpay::instruction::Withdraw { amount }, accounts, &remaining)
    } else {
        ix(hodlpay::instruction::Deposit { amount }, accounts, &[])
    };
    send(&mut env.svm, i, &[&u.kp])
}

fn checkout(env: &mut Env, u: &User, merchant: &Pubkey, merchant_usdc: Pubkey, amount: u64) -> Result<Pubkey, String> {
    let assets = [pda(&[ASSET_SEED, env.sol.as_ref()]), pda(&[ASSET_SEED, env.zec.as_ref()])];
    checkout_valued(env, u, merchant, merchant_usdc, amount, &assets)
}

fn checkout_valued(
    env: &mut Env,
    u: &User,
    merchant: &Pubkey,
    merchant_usdc: Pubkey,
    amount: u64,
    assets: &[Pubkey],
) -> Result<Pubkey, String> {
    let p: Position = read(&env.svm, &u.position);
    let loan = pda(&[LOAN_SEED, u.position.as_ref(), &p.loan_count.to_le_bytes()]);
    send(
        &mut env.svm,
        ix(
            hodlpay::instruction::Checkout { amount },
            hodlpay::accounts::Checkout {
                owner: u.kp.pubkey(),
                config: pda(&[CONFIG_SEED]),
                position: u.position,
                loan,
                merchant: *merchant,
                merchant_usdc,
                liquidity_vault: pda(&[LIQUIDITY_SEED]),
                token_program: anchor_spl::token::ID,
                system_program: anchor_lang::system_program::ID,
                credit: credit_pda(&u.kp.pubkey()),
            },
            assets,
        ),
        &[&u.kp],
    )?;
    Ok(loan)
}

fn repay(env: &mut Env, u: &User, loan: Pubkey) -> Result<(), String> {
    send(
        &mut env.svm,
        ix(
            hodlpay::instruction::Repay {},
            hodlpay::accounts::Repay {
                owner: u.kp.pubkey(),
                config: pda(&[CONFIG_SEED]),
                position: u.position,
                loan,
                user_usdc: u.usdc_ata,
                liquidity_vault: pda(&[LIQUIDITY_SEED]),
                token_program: anchor_spl::token::ID,
                credit: credit_pda(&u.kp.pubkey()),
                system_program: anchor_lang::system_program::ID,
            },
            &[],
        ),
        &[&u.kp],
    )
}

fn set_price(env: &mut Env, mint: Pubkey, price_e6: u64) {
    send(
        &mut env.svm,
        ix(
            hodlpay::instruction::UpdatePrice { price_e6 },
            hodlpay::accounts::UpdatePrice {
                keeper: env.admin.pubkey(),
                config: pda(&[CONFIG_SEED]),
                asset: pda(&[ASSET_SEED, mint.as_ref()]),
            },
            &[],
        ),
        &[&env.admin],
    )
    .unwrap();
}

fn liquidate(env: &mut Env, liquidator: &User, owner: &User, repay_amount: u64) -> Result<(), String> {
    send(
        &mut env.svm,
        ix(
            hodlpay::instruction::Liquidate { repay_amount },
            hodlpay::accounts::Liquidate {
                liquidator: liquidator.kp.pubkey(),
                config: pda(&[CONFIG_SEED]),
                position: owner.position,
                asset: pda(&[ASSET_SEED, env.sol.as_ref()]),
                vault: pda(&[COLLATERAL_VAULT_SEED, env.sol.as_ref()]),
                liquidator_usdc: liquidator.usdc_ata,
                liquidator_collateral: liquidator.sol_ata,
                liquidity_vault: pda(&[LIQUIDITY_SEED]),
                token_program: anchor_spl::token::ID,
                credit: credit_pda(&owner.kp.pubkey()),
            },
            &[pda(&[ASSET_SEED, env.sol.as_ref()]), pda(&[ASSET_SEED, env.zec.as_ref()])],
        ),
        &[&liquidator.kp],
    )
}

fn collect_overdue(env: &mut Env, collector: &User, owner: &User, loan: Pubkey) -> Result<(), String> {
    send(
        &mut env.svm,
        ix(
            hodlpay::instruction::CollectOverdue {},
            hodlpay::accounts::CollectOverdue {
                collector: collector.kp.pubkey(),
                config: pda(&[CONFIG_SEED]),
                position: owner.position,
                loan,
                asset: pda(&[ASSET_SEED, env.sol.as_ref()]),
                vault: pda(&[COLLATERAL_VAULT_SEED, env.sol.as_ref()]),
                collector_usdc: collector.usdc_ata,
                collector_collateral: collector.sol_ata,
                liquidity_vault: pda(&[LIQUIDITY_SEED]),
                token_program: anchor_spl::token::ID,
                credit: credit_pda(&owner.kp.pubkey()),
            },
            &[],
        ),
        &[&collector.kp],
    )
}

fn advance(env: &mut Env, secs: i64) {
    let mut clock: anchor_lang::prelude::Clock = env.svm.get_sysvar();
    clock.unix_timestamp += secs;
    env.svm.set_sysvar(&clock);
}

#[test]
fn overdue_installment_is_collected_from_collateral() {
    let mut env = setup();
    let frank = new_user(&mut env, 25 * SOL, 0);
    let merchant = Keypair::new();
    let merchant_usdc = CreateAssociatedTokenAccount::new(&mut env.svm, &env.admin, &env.usdc)
        .owner(&merchant.pubkey())
        .send()
        .unwrap();
    let (sol, sol_ata) = (env.sol, frank.sol_ata);
    move_collateral(&mut env, &frank, sol, sol_ata, 25 * SOL, false).unwrap();
    let loan = checkout(&mut env, &frank, &merchant.pubkey(), merchant_usdc, 800 * USDC).unwrap();
    let keeper = new_user(&mut env, 0, 10_000 * USDC);

    // The first installment is due at checkout; within the 3-day grace it cannot be collected.
    advance(&mut env, 3 * DAY);
    set_price(&mut env, sol, 100 * USDC);
    assert!(collect_overdue(&mut env, &keeper, &frank, loan).is_err());

    // Past the grace period the keeper pays $200 + $2 late fee and takes $212.10 of SOL (5% bonus).
    advance(&mut env, 1);
    set_price(&mut env, sol, 100 * USDC);
    let pool_before = balance(&env.svm, &pda(&[LIQUIDITY_SEED]));
    collect_overdue(&mut env, &keeper, &frank, loan).unwrap();
    assert_eq!(balance(&env.svm, &keeper.usdc_ata), 9_798 * USDC);
    assert_eq!(balance(&env.svm, &keeper.sol_ata), 2_121_000_000);
    assert_eq!(balance(&env.svm, &pda(&[LIQUIDITY_SEED])) - pool_before, 202 * USDC);

    let p: Position = read(&env.svm, &frank.position);
    assert_eq!(p.debt, 600 * USDC);
    assert_eq!(p.amounts[0], 25 * SOL - 2_121_000_000);
    let l: Loan = read(&env.svm, &loan);
    assert_eq!(l.installments_paid, 1);
    assert_eq!(l.late_fees_paid, 2 * USDC);
    assert_eq!(l.fee_earned, 6 * USDC);
    let c: hodlpay::state::Config = read(&env.svm, &pda(&[CONFIG_SEED]));
    assert_eq!(c.fees_earned, 8 * USDC);
    assert_eq!(c.total_debt, 600 * USDC);

    // The next installment is not due for another 14 days, so it cannot be collected twice.
    assert!(collect_overdue(&mut env, &keeper, &frank, loan).is_err());

    // Frank can still pay the rest himself.
    MintTo::new(&mut env.svm, &env.admin, &env.usdc, &frank.usdc_ata, 600 * USDC).send().unwrap();
    for _ in 0..3 {
        repay(&mut env, &frank, loan).unwrap();
    }
    let p: Position = read(&env.svm, &frank.position);
    assert_eq!(p.debt, 0);
    assert!(collect_overdue(&mut env, &keeper, &frank, loan).is_err());
}

#[test]
fn bnpl_lifecycle() {
    let mut env = setup();
    let alice = new_user(&mut env, 25 * SOL, 1_000 * USDC);
    let merchant = Keypair::new();
    let merchant_usdc = CreateAssociatedTokenAccount::new(&mut env.svm, &env.admin, &env.usdc)
        .owner(&merchant.pubkey())
        .send()
        .unwrap();

    // Lock 25 SOL @ $120 = $3,000 collateral, $1,500 credit.
    let (sol, sol_ata) = (env.sol, alice.sol_ata);
    move_collateral(&mut env, &alice, sol, sol_ata, 25 * SOL, false).unwrap();
    assert_eq!(balance(&env.svm, &pda(&[COLLATERAL_VAULT_SEED, sol.as_ref()])), 25 * SOL);

    // Buy an $860 flight: merchant is paid $834.20 up front.
    let loan = checkout(&mut env, &alice, &merchant.pubkey(), merchant_usdc, 860 * USDC).unwrap();
    assert_eq!(balance(&env.svm, &merchant_usdc), 834_200_000);
    let p: Position = read(&env.svm, &alice.position);
    assert_eq!(p.debt, 860 * USDC);
    let l: Loan = read(&env.svm, &loan);
    assert_eq!(l.installment_amount, 215 * USDC);

    // Credit limit is enforced: only $640 left.
    assert!(checkout(&mut env, &alice, &merchant.pubkey(), merchant_usdc, 700 * USDC).is_err());

    // First installment.
    repay(&mut env, &alice, loan).unwrap();
    assert_eq!(balance(&env.svm, &alice.usdc_ata), 785 * USDC);
    let p: Position = read(&env.svm, &alice.position);
    assert_eq!(p.debt, 645 * USDC);

    // Withdrawing 20 SOL would leave $600 collateral / $300 limit < $645 debt.
    assert!(move_collateral(&mut env, &alice, sol, sol_ata, 20 * SOL, true).is_err());
    // Withdrawing 10 SOL leaves $1,800 / $900 limit: fine.
    move_collateral(&mut env, &alice, sol, sol_ata, 10 * SOL, true).unwrap();

    // Healthy position cannot be liquidated.
    let bob = new_user(&mut env, 0, 10_000 * USDC);
    assert!(liquidate(&mut env, &bob, &alice, 100 * USDC).is_err());

    // SOL crashes to $50: 15 SOL = $750, liquidation line $562.50 < $645 debt.
    set_price(&mut env, sol, 50 * USDC);
    // Close factor caps a single liquidation at 50% of debt.
    assert!(liquidate(&mut env, &bob, &alice, 400 * USDC).is_err());
    liquidate(&mut env, &bob, &alice, 300 * USDC).unwrap();

    // Bob paid $300 and received $315 of SOL (5% bonus) = 6.3 SOL.
    assert_eq!(balance(&env.svm, &bob.sol_ata), 6_300_000_000);
    let p: Position = read(&env.svm, &alice.position);
    assert_eq!(p.debt, 345 * USDC);
    assert_eq!(p.credit_balance, 300 * USDC);
    assert_eq!(p.amounts[0], 8_700_000_000);

    // Next installment is covered by the liquidation credit: Alice pays nothing.
    repay(&mut env, &alice, loan).unwrap();
    assert_eq!(balance(&env.svm, &alice.usdc_ata), 785 * USDC);
    let p: Position = read(&env.svm, &alice.position);
    assert_eq!(p.credit_balance, 85 * USDC);

    // Third installment: $85 credit + $130 cash.
    repay(&mut env, &alice, loan).unwrap();
    assert_eq!(balance(&env.svm, &alice.usdc_ata), 655 * USDC);

    // Final installment settles the loan.
    repay(&mut env, &alice, loan).unwrap();
    let l: Loan = read(&env.svm, &loan);
    assert_eq!(l.installments_paid, 4);
    assert_eq!(l.repaid, 860 * USDC);
    let p: Position = read(&env.svm, &alice.position);
    assert_eq!(p.debt, 0);
    assert!(repay(&mut env, &alice, loan).is_err());
}

#[test]
fn underwater_position_writes_off_bad_debt() {
    let mut env = setup();
    let erin = new_user(&mut env, 10 * SOL, 0);
    let merchant = Keypair::new();
    let merchant_usdc = CreateAssociatedTokenAccount::new(&mut env.svm, &env.admin, &env.usdc)
        .owner(&merchant.pubkey())
        .send()
        .unwrap();
    let (sol, sol_ata) = (env.sol, erin.sol_ata);
    move_collateral(&mut env, &erin, sol, sol_ata, 10 * SOL, false).unwrap();
    let loan = checkout(&mut env, &erin, &merchant.pubkey(), merchant_usdc, 600 * USDC).unwrap();

    // SOL gaps to $40: $400 of collateral against $600 of debt.
    set_price(&mut env, sol, 40 * USDC);
    let bob = new_user(&mut env, 0, 10_000 * USDC);
    liquidate(&mut env, &bob, &erin, 300 * USDC).unwrap();
    let p: Position = read(&env.svm, &erin.position);
    assert_eq!(p.debt, 300 * USDC);
    assert!(p.amounts[0] > 0);

    // The second liquidation takes the last SOL; the $219.05 it cannot cover is written off.
    liquidate(&mut env, &bob, &erin, 150 * USDC).unwrap();
    let p: Position = read(&env.svm, &erin.position);
    assert_eq!(p.amounts[0], 0);
    assert_eq!(p.debt, 0);
    assert_eq!(p.credit_balance, 600 * USDC);
    let c: hodlpay::state::Config = read(&env.svm, &pda(&[CONFIG_SEED]));
    assert_eq!(c.total_debt, 0);

    // The loan still closes: every installment is settled from credit, with no cash and no late fee.
    let mut clock: anchor_lang::prelude::Clock = env.svm.get_sysvar();
    clock.unix_timestamp += 60 * DAY;
    env.svm.set_sysvar(&clock);
    for _ in 0..4 {
        repay(&mut env, &erin, loan).unwrap();
    }
    let l: Loan = read(&env.svm, &loan);
    assert_eq!(l.installments_paid, 4);
    assert_eq!(l.late_fees_paid, 0);
    let c: hodlpay::state::Config = read(&env.svm, &pda(&[CONFIG_SEED]));
    assert_eq!(c.unearned_fees, 0);
}

#[test]
fn zcash_collateral_adds_credit() {
    let mut env = setup();
    let carol = new_user(&mut env, 0, 0);
    let zec = env.zec;
    let zec_ata = CreateAssociatedTokenAccount::new(&mut env.svm, &carol.kp, &zec).send().unwrap();
    MintTo::new(&mut env.svm, &env.admin, &zec, &zec_ata, 2 * 100_000_000).send().unwrap();
    let merchant = Keypair::new();
    let merchant_usdc = CreateAssociatedTokenAccount::new(&mut env.svm, &env.admin, &env.usdc)
        .owner(&merchant.pubkey())
        .send()
        .unwrap();

    // 2 zenZEC @ $1,500 = $3,000 at 40% max LTV = $1,200 credit.
    move_collateral(&mut env, &carol, zec, zec_ata, 2 * 100_000_000, false).unwrap();
    assert!(checkout(&mut env, &carol, &merchant.pubkey(), merchant_usdc, 1_201 * USDC).is_err());
    checkout(&mut env, &carol, &merchant.pubkey(), merchant_usdc, 1_200 * USDC).unwrap();
    assert_eq!(balance(&env.svm, &merchant_usdc), 1_164 * USDC);
}

/// The real zenZEC mint (Zenrock) as it exists on Solana mainnet: classic SPL
/// Token, 8 decimals, no freeze authority. Account data copied from mainnet-beta.
const ZENZEC_MAINNET: Pubkey = anchor_lang::prelude::pubkey!("JDt9rRGaieF6aN1cJkXFeUmsy7ZE4yY3CZb8tVMXVroS");

#[test]
fn real_mainnet_zenzec_mint_is_accepted() {
    let mut env = setup();
    let zen = ZENZEC_MAINNET;
    let mint_account = solana_account::Account {
        lamports: 1_461_600,
        data: include_bytes!("fixtures/zenzec-mint.bin").to_vec(),
        owner: anchor_spl::token::ID,
        executable: false,
        rent_epoch: 0,
    };
    env.svm.set_account(zen, mint_account).unwrap();

    let config = pda(&[CONFIG_SEED]);
    let asset = pda(&[ASSET_SEED, zen.as_ref()]);
    send(
        &mut env.svm,
        ix(
            hodlpay::instruction::AddAsset {
                args: AddAssetArgs {
                    max_ltv_bps: 4_000,
                    margin_ltv_bps: 5_500,
                    liquidation_ltv_bps: 6_500,
                    price_e6: 300 * USDC,
                    pyth_feed_id: [0u8; 32],
                },
            },
            hodlpay::accounts::AddAsset {
                admin: env.admin.pubkey(),
                config,
                mint: zen,
                asset,
                vault: pda(&[COLLATERAL_VAULT_SEED, zen.as_ref()]),
                token_program: anchor_spl::token::ID,
                system_program: anchor_lang::system_program::ID,
            },
            &[],
        ),
        &[&env.admin],
    )
    .unwrap();
    let a: hodlpay::state::CollateralAsset = read(&env.svm, &asset);
    assert_eq!(a.decimals, 8);

    // A holder who minted 2 zenZEC through Zenrock (balance written directly: we don't hold the mint authority).
    let gina = new_user(&mut env, 0, 0);
    let zen_ata = CreateAssociatedTokenAccount::new(&mut env.svm, &gina.kp, &zen).send().unwrap();
    let mut acc = env.svm.get_account(&zen_ata).unwrap();
    acc.data[64..72].copy_from_slice(&(2 * 100_000_000u64).to_le_bytes());
    env.svm.set_account(zen_ata, acc).unwrap();

    move_collateral(&mut env, &gina, zen, zen_ata, 2 * 100_000_000, false).unwrap();
    assert_eq!(balance(&env.svm, &pda(&[COLLATERAL_VAULT_SEED, zen.as_ref()])), 2 * 100_000_000);

    // 2 zenZEC @ $300 = $600 at 40% max LTV = $240 of credit.
    let merchant = Keypair::new();
    let merchant_usdc = CreateAssociatedTokenAccount::new(&mut env.svm, &env.admin, &env.usdc)
        .owner(&merchant.pubkey())
        .send()
        .unwrap();
    let assets = [pda(&[ASSET_SEED, env.sol.as_ref()]), pda(&[ASSET_SEED, env.zec.as_ref()]), asset];
    assert!(checkout_valued(&mut env, &gina, &merchant.pubkey(), merchant_usdc, 241 * USDC, &assets).is_err());
    checkout_valued(&mut env, &gina, &merchant.pubkey(), merchant_usdc, 240 * USDC, &assets).unwrap();
    assert_eq!(balance(&env.svm, &merchant_usdc), 232_800_000);
}

#[test]
fn stale_price_blocks_new_credit() {
    let mut env = setup();
    let dave = new_user(&mut env, 10 * SOL, 0);
    let (sol, sol_ata) = (env.sol, dave.sol_ata);
    move_collateral(&mut env, &dave, sol, sol_ata, 10 * SOL, false).unwrap();
    let merchant = Keypair::new();
    let merchant_usdc = CreateAssociatedTokenAccount::new(&mut env.svm, &env.admin, &env.usdc)
        .owner(&merchant.pubkey())
        .send()
        .unwrap();

    let mut clock: anchor_lang::prelude::Clock = env.svm.get_sysvar();
    clock.unix_timestamp += 301;
    env.svm.set_sysvar(&clock);
    assert!(checkout(&mut env, &dave, &merchant.pubkey(), merchant_usdc, 100 * USDC).is_err());

    set_price(&mut env, sol, 120 * USDC);
    checkout(&mut env, &dave, &merchant.pubkey(), merchant_usdc, 100 * USDC).unwrap();
}

#[test]
fn lp_shares_earn_merchant_and_late_fees() {
    let mut env = setup();
    let alice = new_user(&mut env, 2_000 * SOL, 100_000 * USDC);
    let merchant = Keypair::new();
    let merchant_usdc = CreateAssociatedTokenAccount::new(&mut env.svm, &env.admin, &env.usdc)
        .owner(&merchant.pubkey())
        .send()
        .unwrap();
    let vault = pda(&[LIQUIDITY_SEED]);
    let (sol, sol_ata) = (env.sol, alice.sol_ata);
    move_collateral(&mut env, &alice, sol, sol_ata, 2_000 * SOL, false).unwrap();

    // $80k purchase: the pool pays the merchant $77.6k. The $2.4k fee is unearned until repaid.
    let loan = checkout(&mut env, &alice, &merchant.pubkey(), merchant_usdc, 80_000 * USDC).unwrap();
    assert_eq!(balance(&env.svm, &vault), 22_400 * USDC);
    let c: hodlpay::state::Config = read(&env.svm, &pda(&[CONFIG_SEED]));
    assert_eq!(c.unearned_fees, 2_400 * USDC);
    assert_eq!(c.fees_earned, 0);

    // Lent-out funds cannot be withdrawn: 100k shares are worth $100k, only $22.4k is idle.
    let (admin, admin_usdc, admin_lp) = (env.admin.insecure_clone(), env.admin_usdc, env.admin_lp);
    assert!(liquidity(&mut env, &admin, admin_usdc, admin_lp, 100_000 * USDC, false).is_err());

    // A second LP joining right after the checkout gets no share of its fee: $10k buys 10k shares.
    let bob = Keypair::new();
    env.svm.airdrop(&bob.pubkey(), SOL).unwrap();
    let bob_usdc = CreateAssociatedTokenAccount::new(&mut env.svm, &bob, &env.usdc).send().unwrap();
    let bob_lp = CreateAssociatedTokenAccount::new(&mut env.svm, &bob, &pda(&[LP_MINT_SEED])).send().unwrap();
    MintTo::new(&mut env.svm, &env.admin, &env.usdc, &bob_usdc, 10_000 * USDC).send().unwrap();
    liquidity(&mut env, &bob, bob_usdc, bob_lp, 10_000 * USDC, true).unwrap();
    assert_eq!(balance(&env.svm, &bob_lp), 10_000 * USDC);

    // Installment 1 on time releases a quarter of the fee.
    repay(&mut env, &alice, loan).unwrap();
    let c: hodlpay::state::Config = read(&env.svm, &pda(&[CONFIG_SEED]));
    assert_eq!(c.fees_earned, 600 * USDC);
    assert_eq!(c.unearned_fees, 1_800 * USDC);

    // Installment 2 paid 17 days in (due day 14 + 3 day grace): 1% late fee.
    let mut clock: anchor_lang::prelude::Clock = env.svm.get_sysvar();
    clock.unix_timestamp += 17 * DAY + 1;
    env.svm.set_sysvar(&clock);
    repay(&mut env, &alice, loan).unwrap();
    assert_eq!(balance(&env.svm, &alice.usdc_ata), 59_800 * USDC);
    let l: Loan = read(&env.svm, &loan);
    assert_eq!(l.late_fees_paid, 200 * USDC);

    // Installments 3 and 4 are not yet overdue.
    repay(&mut env, &alice, loan).unwrap();
    repay(&mut env, &alice, loan).unwrap();
    assert_eq!(balance(&env.svm, &alice.usdc_ata), 19_800 * USDC);
    let c: hodlpay::state::Config = read(&env.svm, &pda(&[CONFIG_SEED]));
    assert_eq!(c.fees_earned, 2_600 * USDC);
    assert_eq!(c.unearned_fees, 0);
    assert_eq!(c.total_debt, 0);
    let l: Loan = read(&env.svm, &loan);
    assert_eq!(l.fee_earned, 2_400 * USDC);

    // The late installment reset Alice's credit record; installments 3 and 4, prepaid on day 17
    // for due dates on days 28 and 42, are outside the credit window and build nothing back.
    let credit: CreditProfile = read(&env.svm, &credit_pda(&alice.kp.pubkey()));
    assert_eq!(credit.resets, 1);
    assert_eq!(credit.on_time_repaid, 0);
    assert_eq!(credit.bonus_bps(), 0);

    // Both LPs exit with their share of the $2.6k in fees.
    let pool = balance(&env.svm, &vault);
    assert_eq!(pool, 112_600 * USDC);
    let before = balance(&env.svm, &admin_usdc);
    liquidity(&mut env, &admin, admin_usdc, admin_lp, 100_000 * USDC, false).unwrap();
    let admin_out = balance(&env.svm, &admin_usdc) - before;
    assert_eq!(admin_out, ((100_000 * USDC) as u128 * pool as u128 / (110_000 * USDC) as u128) as u64);
    assert!(admin_out > 102_300 * USDC);
    liquidity(&mut env, &bob, bob_usdc, bob_lp, 10_000 * USDC, false).unwrap();
    assert!(balance(&env.svm, &bob_usdc) > 10_200 * USDC);
    assert_eq!(balance(&env.svm, &vault), 0);
}

#[test]
fn on_time_repayments_raise_the_credit_limit() {
    let mut env = setup();
    let hana = new_user(&mut env, 10 * SOL, 5_000 * USDC);
    let merchant = Keypair::new();
    let merchant_usdc = CreateAssociatedTokenAccount::new(&mut env.svm, &env.admin, &env.usdc)
        .owner(&merchant.pubkey())
        .send()
        .unwrap();
    let (sol, sol_ata) = (env.sol, hana.sol_ata);
    let m = merchant.pubkey();

    // 10 SOL @ $120 = $1,200 at 50% max LTV: $600 of credit before any history.
    move_collateral(&mut env, &hana, sol, sol_ata, 10 * SOL, false).unwrap();
    assert!(checkout(&mut env, &hana, &m, merchant_usdc, 601 * USDC).is_err());
    let first = checkout(&mut env, &hana, &m, merchant_usdc, 600 * USDC).unwrap();

    // The installment due at checkout never counts. Installment 2, prepaid 14 days early,
    // is accepted but builds nothing: a record cannot be bought in one sitting.
    repay(&mut env, &hana, first).unwrap();
    repay(&mut env, &hana, first).unwrap();
    let credit: CreditProfile = read(&env.svm, &credit_pda(&hana.kp.pubkey()));
    assert_eq!(credit.owner, hana.kp.pubkey());
    assert_eq!(credit.on_time_repaid, 0);
    assert_eq!(credit.bonus_bps(), 0);

    // Installments 3 and 4 ($300), each paid in the week before its due date (days 28 and 42), count.
    advance(&mut env, 22 * DAY);
    set_price(&mut env, sol, 120 * USDC);
    repay(&mut env, &hana, first).unwrap();
    advance(&mut env, 14 * DAY);
    set_price(&mut env, sol, 120 * USDC);
    repay(&mut env, &hana, first).unwrap();
    let credit: CreditProfile = read(&env.svm, &credit_pda(&hana.kp.pubkey()));
    assert_eq!(credit.on_time_repaid, 300 * USDC);
    assert_eq!(credit.on_time_installments, 2);
    assert_eq!(credit.bonus_bps(), 250);

    // Level 1: SOL max LTV 52.5%, so $630.
    assert!(checkout(&mut env, &hana, &m, merchant_usdc, 631 * USDC).is_err());
    let second = checkout(&mut env, &hana, &m, merchant_usdc, 630 * USDC).unwrap();
    // At the boosted limit, collateral cannot be withdrawn.
    assert!(move_collateral(&mut env, &hana, sol, sol_ata, SOL / 10, true).is_err());

    // Two more on time ($157.50 each, due days 50 and 64 counted from day 36) reach level 2.
    repay(&mut env, &hana, second).unwrap();
    advance(&mut env, 8 * DAY);
    set_price(&mut env, sol, 120 * USDC);
    repay(&mut env, &hana, second).unwrap();
    advance(&mut env, 14 * DAY);
    set_price(&mut env, sol, 120 * USDC);
    repay(&mut env, &hana, second).unwrap();
    let credit: CreditProfile = read(&env.svm, &credit_pda(&hana.kp.pubkey()));
    assert_eq!(credit.on_time_repaid, 615 * USDC);
    assert_eq!(credit.bonus_bps(), 500);

    // Installment 4 (due day 78) is left unpaid past its grace period and collected from collateral: the record resets.
    advance(&mut env, 23 * DAY + 1);
    set_price(&mut env, sol, 120 * USDC);
    let keeper = new_user(&mut env, 0, 10_000 * USDC);
    collect_overdue(&mut env, &keeper, &hana, second).unwrap();
    let credit: CreditProfile = read(&env.svm, &credit_pda(&hana.kp.pubkey()));
    assert_eq!(credit.on_time_repaid, 0);
    assert_eq!(credit.resets, 1);

    // Back to 50%: ~8.61 SOL = $1,033 → $516 limit. At 55% ($568) this would have fit.
    assert!(checkout(&mut env, &hana, &m, merchant_usdc, 540 * USDC).is_err());
    checkout(&mut env, &hana, &m, merchant_usdc, 516 * USDC).unwrap();
}

#[test]
fn admin_lowers_the_merchant_fee() {
    let mut env = setup();
    let ivy = new_user(&mut env, 25 * SOL, 0);
    let merchant = Keypair::new();
    let merchant_usdc = CreateAssociatedTokenAccount::new(&mut env.svm, &env.admin, &env.usdc)
        .owner(&merchant.pubkey())
        .send()
        .unwrap();
    let (sol, sol_ata) = (env.sol, ivy.sol_ata);
    move_collateral(&mut env, &ivy, sol, sol_ata, 25 * SOL, false).unwrap();
    let first = checkout(&mut env, &ivy, &merchant.pubkey(), merchant_usdc, 500 * USDC).unwrap();

    let set_fee = |admin: Pubkey, merchant_fee_bps: u16| {
        ix(
            hodlpay::instruction::SetMerchantFee { merchant_fee_bps },
            hodlpay::accounts::SetMerchantFee { admin, config: pda(&[CONFIG_SEED]) },
            &[],
        )
    };
    assert!(send(&mut env.svm, set_fee(ivy.kp.pubkey(), 150), &[&ivy.kp]).is_err());
    assert!(send(&mut env.svm, set_fee(env.admin.pubkey(), 2_000), &[&env.admin]).is_err());
    let admin = env.admin.insecure_clone();
    send(&mut env.svm, set_fee(admin.pubkey(), 150), &[&admin]).unwrap();

    // New checkouts pay 1.5%; the open loan keeps its 3%.
    let before = balance(&env.svm, &merchant_usdc);
    let second = checkout(&mut env, &ivy, &merchant.pubkey(), merchant_usdc, 500 * USDC).unwrap();
    assert_eq!(balance(&env.svm, &merchant_usdc) - before, 492_500_000);
    assert_eq!(read::<Loan>(&env.svm, &second).fee, 7_500_000);
    assert_eq!(read::<Loan>(&env.svm, &first).fee, 15 * USDC);
}

fn price_update(feed: [u8; 32], price: i64, conf: u64, exponent: i32, publish_time: i64, full: bool) -> Vec<u8> {
    let mut d = PRICE_UPDATE_V2_DISCRIMINATOR.to_vec();
    d.extend([0u8; 32]);
    if full {
        d.push(1);
    } else {
        d.extend([0, 5]);
    }
    d.extend(feed);
    d.extend(price.to_le_bytes());
    d.extend(conf.to_le_bytes());
    d.extend(exponent.to_le_bytes());
    d.extend(publish_time.to_le_bytes());
    d.extend(publish_time.to_le_bytes());
    d.extend(price.to_le_bytes());
    d.extend(conf.to_le_bytes());
    d.extend(0u64.to_le_bytes());
    d
}

fn post_update(env: &mut Env, data: Vec<u8>, owner: Pubkey) -> Pubkey {
    let key = Keypair::new().pubkey();
    let account = solana_account::Account { lamports: 10_000_000, data, owner, executable: false, rent_epoch: 0 };
    env.svm.set_account(key, account).unwrap();
    key
}

fn refresh(env: &mut Env, mint: Pubkey, price_update: Pubkey) -> Result<(), String> {
    let payer = Keypair::new();
    env.svm.airdrop(&payer.pubkey(), SOL).unwrap();
    let i = ix(
        hodlpay::instruction::RefreshPrice {},
        hodlpay::accounts::RefreshPrice {
            config: pda(&[CONFIG_SEED]),
            asset: pda(&[ASSET_SEED, mint.as_ref()]),
            price_update,
        },
        &[],
    );
    send(&mut env.svm, i, &[&payer])
}

#[test]
fn anyone_can_refresh_price_from_pyth() {
    let mut env = setup();
    let (sol, zec) = (env.sol, env.zec);
    let asset = pda(&[ASSET_SEED, sol.as_ref()]);
    let mut clock: anchor_lang::prelude::Clock = env.svm.get_sysvar();
    clock.unix_timestamp += 100;
    env.svm.set_sysvar(&clock);
    let now = clock.unix_timestamp;

    // $150.12345678 with exponent -8, published 10s ago.
    let good = price_update(SOL_FEED, 15_012_345_678, 10_000_000, -8, now - 10, true);
    let wrong_owner = post_update(&mut env, good.clone(), Keypair::new().pubkey());
    assert!(refresh(&mut env, sol, wrong_owner).is_err());
    let partial = post_update(&mut env, price_update(SOL_FEED, 15_012_345_678, 10_000_000, -8, now - 10, false), PYTH_RECEIVER_ID);
    assert!(refresh(&mut env, sol, partial).is_err());
    let other_feed = post_update(&mut env, price_update([9u8; 32], 15_012_345_678, 10_000_000, -8, now - 10, true), PYTH_RECEIVER_ID);
    assert!(refresh(&mut env, sol, other_feed).is_err());
    let stale = post_update(&mut env, price_update(SOL_FEED, 15_012_345_678, 10_000_000, -8, now - 301, true), PYTH_RECEIVER_ID);
    assert!(refresh(&mut env, sol, stale).is_err());
    let uncertain = post_update(&mut env, price_update(SOL_FEED, 15_012_345_678, 400_000_000, -8, now - 10, true), PYTH_RECEIVER_ID);
    assert!(refresh(&mut env, sol, uncertain).is_err());

    let ok = post_update(&mut env, good, PYTH_RECEIVER_ID);
    refresh(&mut env, sol, ok).unwrap();
    let a: hodlpay::state::CollateralAsset = read(&env.svm, &asset);
    assert_eq!(a.price_e6, 150_123_456);
    assert_eq!(a.price_updated_at, now - 10);

    // An older update never overwrites a newer price.
    let older = post_update(&mut env, price_update(SOL_FEED, 9_000_000_000, 1_000_000, -8, now - 20, true), PYTH_RECEIVER_ID);
    refresh(&mut env, sol, older).unwrap();
    let a: hodlpay::state::CollateralAsset = read(&env.svm, &asset);
    assert_eq!(a.price_e6, 150_123_456);

    // Assets without a configured feed only accept keeper prices.
    let zec_update = post_update(&mut env, price_update([0u8; 32], 30_000_000_000, 1_000_000, -8, now - 10, true), PYTH_RECEIVER_ID);
    assert!(refresh(&mut env, zec, zec_update).is_err());
}

/// Needs `cargo build-sbf --features mainnet --sbf-out-dir target/mainnet` (CI runs it).
#[test]
fn mainnet_build_prices_from_pyth_only() {
    let path = concat!(env!("CARGO_TARGET_TMPDIR"), "/../mainnet/hodlpay.so");
    let Ok(bytes) = std::fs::read(path) else {
        eprintln!("skipped: {path} not built");
        return;
    };
    let mut env = setup_with(&bytes);
    let sol = env.sol;
    let admin = env.admin.insecure_clone();
    let keeper_price = ix(
        hodlpay::instruction::UpdatePrice { price_e6: 1 },
        hodlpay::accounts::UpdatePrice {
            keeper: admin.pubkey(),
            config: pda(&[CONFIG_SEED]),
            asset: pda(&[ASSET_SEED, sol.as_ref()]),
        },
        &[],
    );
    let err = send(&mut env.svm, keeper_price, &[&admin]).unwrap_err();
    assert!(err.contains("KeeperPricesDisabled"), "{err}");

    advance(&mut env, 10);
    let now = env.svm.get_sysvar::<anchor_lang::prelude::Clock>().unix_timestamp;
    let update = post_update(&mut env, price_update(SOL_FEED, 9_000_000_000, 1_000_000, -8, now, true), PYTH_RECEIVER_ID);
    refresh(&mut env, sol, update).unwrap();
    let a: hodlpay::state::CollateralAsset = read(&env.svm, &pda(&[ASSET_SEED, sol.as_ref()]));
    assert_eq!(a.price_e6, 90 * USDC);
}
