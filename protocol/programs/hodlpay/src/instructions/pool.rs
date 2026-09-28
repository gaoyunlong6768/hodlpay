use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::{constants::*, error::ErrorCode, state::*};

#[derive(Accounts)]
pub struct ProvideLiquidity<'info> {
    pub provider: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = provider)]
    pub provider_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.lp_mint, token::authority = provider)]
    pub provider_lp: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.liquidity_vault)]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.lp_mint)]
    pub lp_mint: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
}

fn mul_div(a: u64, b: u64, c: u64) -> Result<u64> {
    require!(c > 0, ErrorCode::Overflow);
    u64::try_from((a as u128) * (b as u128) / (c as u128)).map_err(|_| error!(ErrorCode::Overflow))
}

/// Deposits USDC into the lending pool for LP shares priced at
/// (idle liquidity + outstanding debt) / share supply.
pub fn handle_deposit_liquidity(ctx: Context<ProvideLiquidity>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);
    let supply = ctx.accounts.lp_mint.supply;
    let value = ctx.accounts.config.pool_value(ctx.accounts.liquidity_vault.amount)?;
    let shares = if supply == 0 || value == 0 { amount } else { mul_div(amount, supply, value)? };
    require!(shares > 0, ErrorCode::ZeroAmount);

    token::transfer(
        CpiContext::new(
            token::ID,
            Transfer {
                from: ctx.accounts.provider_usdc.to_account_info(),
                to: ctx.accounts.liquidity_vault.to_account_info(),
                authority: ctx.accounts.provider.to_account_info(),
            },
        ),
        amount,
    )?;
    let seeds: &[&[u8]] = &[CONFIG_SEED, &[ctx.accounts.config.bump]];
    token::mint_to(
        CpiContext::new_with_signer(
            token::ID,
            MintTo {
                mint: ctx.accounts.lp_mint.to_account_info(),
                to: ctx.accounts.provider_lp.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[seeds],
        ),
        shares,
    )?;

    emit!(LiquidityEvent { provider: ctx.accounts.provider.key(), amount, shares, deposit: true });
    Ok(())
}

/// Burns LP shares for their USDC value. Only idle liquidity can leave; funds
/// lent to shoppers come back as installments are repaid.
pub fn handle_withdraw_liquidity(ctx: Context<ProvideLiquidity>, shares: u64) -> Result<()> {
    require!(shares > 0, ErrorCode::ZeroAmount);
    let supply = ctx.accounts.lp_mint.supply;
    let idle = ctx.accounts.liquidity_vault.amount;
    let amount = mul_div(shares, ctx.accounts.config.pool_value(idle)?, supply)?;
    require!(amount > 0, ErrorCode::ZeroAmount);
    require!(amount <= idle, ErrorCode::InsufficientLiquidity);

    token::burn(
        CpiContext::new(
            token::ID,
            Burn {
                mint: ctx.accounts.lp_mint.to_account_info(),
                from: ctx.accounts.provider_lp.to_account_info(),
                authority: ctx.accounts.provider.to_account_info(),
            },
        ),
        shares,
    )?;
    let seeds: &[&[u8]] = &[CONFIG_SEED, &[ctx.accounts.config.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token::ID,
            Transfer {
                from: ctx.accounts.liquidity_vault.to_account_info(),
                to: ctx.accounts.provider_usdc.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;

    emit!(LiquidityEvent { provider: ctx.accounts.provider.key(), amount, shares, deposit: false });
    Ok(())
}
