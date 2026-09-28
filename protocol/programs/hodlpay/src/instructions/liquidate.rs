use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    math::{amount_for_value, apply_bps, valuate, value_e6},
    state::*,
};

#[derive(Accounts)]
pub struct Liquidate<'info> {
    pub liquidator: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [POSITION_SEED, position.owner.as_ref()], bump = position.bump)]
    pub position: Box<Account<'info, Position>>,
    /// Collateral asset to seize.
    #[account(mut, seeds = [ASSET_SEED, asset.mint.as_ref()], bump = asset.bump)]
    pub asset: Box<Account<'info, CollateralAsset>>,
    #[account(mut, address = asset.vault)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = liquidator)]
    pub liquidator_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = asset.mint, token::authority = liquidator)]
    pub liquidator_collateral: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.liquidity_vault)]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/// Repays up to `close_factor` of the debt and seizes collateral worth
/// `repay * (1 + bonus)`. Remaining accounts: every non-empty slot's `CollateralAsset`.
pub fn handle_liquidate(ctx: Context<Liquidate>, repay_amount: u64) -> Result<()> {
    require!(repay_amount > 0, ErrorCode::ZeroAmount);
    let config = &ctx.accounts.config;
    let position = &ctx.accounts.position;
    let asset = &ctx.accounts.asset;

    let v = valuate(
        position,
        ctx.remaining_accounts,
        ctx.program_id,
        Clock::get()?.unix_timestamp,
        config.max_price_age,
    )?;
    require!(position.debt > v.liquidation_limit, ErrorCode::NotLiquidatable);
    require!(
        repay_amount <= apply_bps(position.debt, config.close_factor_bps),
        ErrorCode::ExceedsCloseFactor
    );

    let slot = position
        .slot_of(&asset.mint)
        .ok_or(ErrorCode::AssetNotInPosition)?;
    let slot_amount = position.amounts[slot];
    let slot_value = value_e6(slot_amount, asset.price_e6, asset.decimals)?;

    let bonus_bps = BPS as u16 + config.liquidation_bonus_bps;
    let mut repay = repay_amount;
    let mut seize_value = apply_bps(repay, bonus_bps);
    if seize_value > slot_value {
        seize_value = slot_value;
        repay = ((slot_value as u128) * BPS as u128 / bonus_bps as u128) as u64;
    }
    let seize = amount_for_value(seize_value, asset.price_e6, asset.decimals)?.min(slot_amount);
    require!(repay > 0 && seize > 0, ErrorCode::ZeroAmount);

    token::transfer(
        CpiContext::new(
            token::ID,
            Transfer {
                from: ctx.accounts.liquidator_usdc.to_account_info(),
                to: ctx.accounts.liquidity_vault.to_account_info(),
                authority: ctx.accounts.liquidator.to_account_info(),
            },
        ),
        repay,
    )?;

    let seeds: &[&[u8]] = &[CONFIG_SEED, &[config.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token::ID,
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.liquidator_collateral.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[seeds],
        ),
        seize,
    )?;

    let mint = asset.mint;
    let p = &mut ctx.accounts.position;
    p.amounts[slot] -= seize;
    p.debt -= repay;
    p.credit_balance += repay;
    ctx.accounts.asset.total_deposited -= seize;
    let config = &mut ctx.accounts.config;
    config.total_debt = config.total_debt.saturating_sub(repay);

    // No collateral left: write the shortfall off as pool bad debt so LP share
    // price stops counting it. The written-off amount still settles the
    // remaining installments through `credit_balance`, so the loans can close.
    let bad_debt = if p.amounts.iter().all(|&a| a == 0) { p.debt } else { 0 };
    if bad_debt > 0 {
        config.total_debt = config.total_debt.saturating_sub(bad_debt);
        p.credit_balance += bad_debt;
        p.debt = 0;
    }

    emit!(LiquidationEvent {
        owner: p.owner,
        liquidator: ctx.accounts.liquidator.key(),
        mint,
        repaid: repay,
        seized: seize,
        bad_debt,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CheckHealth<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(seeds = [POSITION_SEED, position.owner.as_ref()], bump = position.bump)]
    pub position: Box<Account<'info, Position>>,
}

/// Emits a `MarginEvent` when debt is above the margin line, so off-chain
/// notifiers can alert the user before liquidation.
pub fn handle_check_health(ctx: Context<CheckHealth>) -> Result<()> {
    let p = &ctx.accounts.position;
    let v = valuate(
        p,
        ctx.remaining_accounts,
        ctx.program_id,
        Clock::get()?.unix_timestamp,
        ctx.accounts.config.max_price_age,
    )?;
    if p.debt > v.margin_limit {
        emit!(MarginEvent {
            owner: p.owner,
            debt: p.debt,
            margin_limit: v.margin_limit,
        });
    }
    Ok(())
}
