use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{constants::*, error::ErrorCode, state::*};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProtocolArgs {
    pub treasury: Pubkey,
    pub treasury_share_bps: u16,
    pub reserve_share_bps: u16,
    pub max_loan: u64,
    pub max_total_debt: u64,
}

fn apply(protocol: &mut Protocol, args: ProtocolArgs) -> Result<()> {
    require!(
        args.treasury_share_bps as u32 + args.reserve_share_bps as u32 <= MAX_PROTOCOL_SHARE_BPS as u32,
        ErrorCode::InvalidParam
    );
    protocol.treasury = args.treasury;
    protocol.treasury_share_bps = args.treasury_share_bps;
    protocol.reserve_share_bps = args.reserve_share_bps;
    protocol.max_loan = args.max_loan;
    protocol.max_total_debt = args.max_total_debt;
    Ok(())
}

#[derive(Accounts)]
pub struct InitProtocol<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        init,
        payer = admin,
        space = 8 + Protocol::INIT_SPACE,
        seeds = [PROTOCOL_SEED],
        bump
    )]
    pub protocol: Box<Account<'info, Protocol>>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_protocol(ctx: Context<InitProtocol>, args: ProtocolArgs) -> Result<()> {
    ctx.accounts.protocol.bump = ctx.bumps.protocol;
    apply(&mut ctx.accounts.protocol, args)
}

#[derive(Accounts)]
pub struct SetProtocol<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
}

/// New shares apply to fees earned from now on; balances already accrued stay put.
pub fn handle_set_protocol(ctx: Context<SetProtocol>, args: ProtocolArgs) -> Result<()> {
    apply(&mut ctx.accounts.protocol, args)
}

#[derive(Accounts)]
pub struct ClaimRevenue<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, address = config.liquidity_vault)]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = protocol.treasury)]
    pub treasury_usdc: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/// Pays accrued treasury revenue out of the liquidity vault to the treasury wallet.
pub fn handle_claim_revenue(ctx: Context<ClaimRevenue>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);
    require!(amount <= ctx.accounts.protocol.treasury_balance, ErrorCode::ExceedsTreasury);
    require!(amount <= ctx.accounts.liquidity_vault.amount, ErrorCode::InsufficientLiquidity);

    let seeds: &[&[u8]] = &[CONFIG_SEED, &[ctx.accounts.config.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token::ID,
            Transfer {
                from: ctx.accounts.liquidity_vault.to_account_info(),
                to: ctx.accounts.treasury_usdc.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;
    let p = &mut ctx.accounts.protocol;
    p.treasury_balance -= amount;
    emit!(RevenueEvent {
        treasury_balance: p.treasury_balance,
        reserve_balance: p.reserve_balance,
        amount,
        claimed: true,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct FundReserve<'info> {
    pub funder: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [PROTOCOL_SEED], bump = protocol.bump)]
    pub protocol: Box<Account<'info, Protocol>>,
    #[account(mut, address = config.liquidity_vault)]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = funder)]
    pub funder_usdc: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/// Adds first-loss capital: anyone can pay USDC into the reserve. It cannot be withdrawn;
/// it only ever covers bad debt ahead of LPs.
pub fn handle_fund_reserve(ctx: Context<FundReserve>, amount: u64) -> Result<()> {
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
    )?;
    let p = &mut ctx.accounts.protocol;
    p.reserve_balance += amount;
    p.reserve_funded += amount;
    emit!(RevenueEvent {
        treasury_balance: p.treasury_balance,
        reserve_balance: p.reserve_balance,
        amount,
        claimed: false,
    });
    Ok(())
}
