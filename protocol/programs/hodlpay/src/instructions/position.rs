use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{constants::*, error::ErrorCode, math::valuate, state::*};

#[derive(Accounts)]
pub struct FundLiquidity<'info> {
    pub funder: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = funder)]
    pub funder_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.liquidity_vault)]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_fund_liquidity(ctx: Context<FundLiquidity>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);
    token::transfer(
        CpiContext::new(
            token::ID,
            Transfer {
                from: ctx.accounts.funder_usdc.to_account_info(),
                to: ctx.accounts.liquidity_vault.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        ),
        amount,
    )
}

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, owner.key().as_ref()],
        bump
    )]
    pub position: Box<Account<'info, Position>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_open_position(ctx: Context<OpenPosition>) -> Result<()> {
    let p = &mut ctx.accounts.position;
    p.owner = ctx.accounts.owner.key();
    p.bump = ctx.bumps.position;
    Ok(())
}

#[derive(Accounts)]
pub struct MoveCollateral<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [POSITION_SEED, owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Box<Account<'info, Position>>,
    #[account(mut, seeds = [ASSET_SEED, asset.mint.as_ref()], bump = asset.bump)]
    pub asset: Box<Account<'info, CollateralAsset>>,
    #[account(mut, address = asset.vault)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = asset.mint, token::authority = owner)]
    pub user_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_deposit(ctx: Context<MoveCollateral>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);
    token::transfer(
        CpiContext::new(
            token::ID,
            Transfer {
                from: ctx.accounts.user_token.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    let mint = ctx.accounts.asset.mint;
    let p = &mut ctx.accounts.position;
    let slot = p.slot_for_deposit(&mint)?;
    p.mints[slot] = mint;
    p.amounts[slot] = p.amounts[slot].checked_add(amount).ok_or(ErrorCode::Overflow)?;
    ctx.accounts.asset.total_deposited += amount;
    Ok(())
}

/// Remaining accounts: the `CollateralAsset` of every non-empty slot in the position.
pub fn handle_withdraw(ctx: Context<MoveCollateral>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);
    let mint = ctx.accounts.asset.mint;
    {
        let p = &mut ctx.accounts.position;
        let slot = p.slot_of(&mint).ok_or(ErrorCode::AssetNotInPosition)?;
        require!(p.amounts[slot] >= amount, ErrorCode::InsufficientCollateral);
        p.amounts[slot] -= amount;
    }

    let p = &ctx.accounts.position;
    if p.debt > 0 {
        let v = valuate(
            p,
            ctx.remaining_accounts,
            ctx.program_id,
            Clock::get()?.unix_timestamp,
            ctx.accounts.config.max_price_age,
        )?;
        require!(p.debt <= v.borrow_limit, ErrorCode::ExceedsMaxLtv);
    }

    let seeds: &[&[u8]] = &[CONFIG_SEED, &[ctx.accounts.config.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token::ID,
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_token.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;
    ctx.accounts.asset.total_deposited -= amount;
    Ok(())
}
