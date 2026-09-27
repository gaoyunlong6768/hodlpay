use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::instruction::{AccountMeta, Instruction},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    hodlpay::{
        constants::*,
        state::{Loan, Position},
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

struct Env {
    svm: LiteSVM,
    admin: Keypair,
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

fn read<T: AccountDeserialize>(svm: &LiteSVM, key: &Pubkey) -> T {
    let acc = svm.get_account(key).unwrap();
    T::try_deserialize(&mut &acc.data[..]).unwrap()
}

fn balance(svm: &LiteSVM, key: &Pubkey) -> u64 {
    get_spl_account::<SplAccount>(svm, key).unwrap().amount
}

fn setup() -> Env {
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/hodlpay.so"));
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
                },
            },
            hodlpay::accounts::Initialize {
                admin: admin.pubkey(),
                config,
                usdc_mint: usdc,
                liquidity_vault: pda(&[LIQUIDITY_SEED]),
                token_program: anchor_spl::token::ID,
                system_program: anchor_lang::system_program::ID,
            },
            &[],
        ),
        &[&admin],
    )
    .unwrap();

    for (mint, max, margin, liq, price) in [
        (sol, 5_000, 6_500, 7_500, 120 * USDC),
        (zec, 4_000, 5_500, 6_500, 1_500 * USDC),
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
    MintTo::new(&mut svm, &admin, &usdc, &admin_usdc, 100_000 * USDC).send().unwrap();
    send(
        &mut svm,
        ix(
            hodlpay::instruction::FundLiquidity { amount: 100_000 * USDC },
            hodlpay::accounts::FundLiquidity {
                funder: admin.pubkey(),
                config,
                funder_usdc: admin_usdc,
                liquidity_vault: pda(&[LIQUIDITY_SEED]),
                token_program: anchor_spl::token::ID,
            },
            &[],
        ),
        &[&admin],
    )
    .unwrap();

    Env { svm, admin, usdc, sol, zec }
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
            },
            &[pda(&[ASSET_SEED, env.sol.as_ref()]), pda(&[ASSET_SEED, env.zec.as_ref()])],
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
            },
            &[pda(&[ASSET_SEED, env.sol.as_ref()]), pda(&[ASSET_SEED, env.zec.as_ref()])],
        ),
        &[&liquidator.kp],
    )
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
