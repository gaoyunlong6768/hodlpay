use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{constants::*, error::ErrorCode, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeArgs {
    pub merchant_fee_bps: u16,
    pub liquidation_bonus_bps: u16,
    pub close_factor_bps: u16,
    pub installments: u8,
    pub installment_interval: i64,
    pub max_price_age: i64,
    pub late_fee_bps: u16,
    pub grace_period: i64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Box<Account<'info, Config>>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = admin,
        seeds = [LIQUIDITY_SEED],
        bump,
        token::mint = usdc_mint,
        token::authority = config,
    )]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = admin,
        seeds = [LP_MINT_SEED],
        bump,
        mint::decimals = usdc_mint.decimals,
        mint::authority = config,
    )]
    pub lp_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    require!(args.merchant_fee_bps < 2_000, ErrorCode::InvalidParam);
    require!(args.liquidation_bonus_bps < 2_000, ErrorCode::InvalidParam);
    require!(
        args.close_factor_bps > 0 && args.close_factor_bps as u64 <= BPS,
        ErrorCode::InvalidParam
    );
    require!(args.installments > 0, ErrorCode::InvalidParam);
    require!(args.installment_interval > 0, ErrorCode::InvalidParam);
    require!(args.max_price_age > 0, ErrorCode::InvalidParam);
    require!(args.late_fee_bps < 2_000, ErrorCode::InvalidParam);
    require!(args.grace_period >= 0, ErrorCode::InvalidParam);

    let config = &mut ctx.accounts.config;
    config.lp_mint = ctx.accounts.lp_mint.key();
    config.late_fee_bps = args.late_fee_bps;
    config.grace_period = args.grace_period;
    config.fees_earned = 0;
    config.admin = ctx.accounts.admin.key();
    config.keeper = ctx.accounts.admin.key();
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.liquidity_vault = ctx.accounts.liquidity_vault.key();
    config.merchant_fee_bps = args.merchant_fee_bps;
    config.liquidation_bonus_bps = args.liquidation_bonus_bps;
    config.close_factor_bps = args.close_factor_bps;
    config.installments = args.installments;
    config.installment_interval = args.installment_interval;
    config.max_price_age = args.max_price_age;
    config.total_debt = 0;
    config.bump = ctx.bumps.config;
    config.vault_bump = ctx.bumps.liquidity_vault;
    Ok(())
}

#[derive(Accounts)]
pub struct SetKeeper<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
}

pub fn handle_set_keeper(ctx: Context<SetKeeper>, keeper: Pubkey) -> Result<()> {
    ctx.accounts.config.keeper = keeper;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AddAssetArgs {
    pub max_ltv_bps: u16,
    pub margin_ltv_bps: u16,
    pub liquidation_ltv_bps: u16,
    pub price_e6: u64,
}

#[derive(Accounts)]
pub struct AddAsset<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = admin,
        space = 8 + CollateralAsset::INIT_SPACE,
        seeds = [ASSET_SEED, mint.key().as_ref()],
        bump
    )]
    pub asset: Account<'info, CollateralAsset>,
    #[account(
        init,
        payer = admin,
        seeds = [COLLATERAL_VAULT_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = config,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_add_asset(ctx: Context<AddAsset>, args: AddAssetArgs) -> Result<()> {
    require!(
        args.max_ltv_bps > 0
            && args.max_ltv_bps < args.margin_ltv_bps
            && args.margin_ltv_bps < args.liquidation_ltv_bps
            && (args.liquidation_ltv_bps as u64) < BPS,
        ErrorCode::InvalidLtv
    );
    require!(args.price_e6 > 0, ErrorCode::InvalidPrice);

    let asset = &mut ctx.accounts.asset;
    asset.mint = ctx.accounts.mint.key();
    asset.vault = ctx.accounts.vault.key();
    asset.decimals = ctx.accounts.mint.decimals;
    asset.price_e6 = args.price_e6;
    asset.price_updated_at = Clock::get()?.unix_timestamp;
    asset.max_ltv_bps = args.max_ltv_bps;
    asset.margin_ltv_bps = args.margin_ltv_bps;
    asset.liquidation_ltv_bps = args.liquidation_ltv_bps;
    asset.total_deposited = 0;
    asset.bump = ctx.bumps.asset;
    asset.vault_bump = ctx.bumps.vault;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    pub keeper: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = keeper)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [ASSET_SEED, asset.mint.as_ref()], bump = asset.bump)]
    pub asset: Account<'info, CollateralAsset>,
}

pub fn handle_update_price(ctx: Context<UpdatePrice>, price_e6: u64) -> Result<()> {
    require!(price_e6 > 0, ErrorCode::InvalidPrice);
    let asset = &mut ctx.accounts.asset;
    asset.price_e6 = price_e6;
    asset.price_updated_at = Clock::get()?.unix_timestamp;
    Ok(())
}
