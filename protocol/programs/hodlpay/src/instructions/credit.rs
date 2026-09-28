use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    math::{apply_bps, valuate},
    state::*,
};

#[derive(Accounts)]
pub struct Checkout<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [POSITION_SEED, owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Box<Account<'info, Position>>,
    #[account(
        init,
        payer = owner,
        space = 8 + Loan::INIT_SPACE,
        seeds = [LOAN_SEED, position.key().as_ref(), &position.loan_count.to_le_bytes()],
        bump
    )]
    pub loan: Box<Account<'info, Loan>>,
    /// CHECK: merchant wallet; only used to bind the settlement token account.
    pub merchant: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = config.usdc_mint,
        token::authority = merchant,
    )]
    pub merchant_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.liquidity_vault)]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Remaining accounts: the `CollateralAsset` of every non-empty slot in the position.
pub fn handle_checkout(ctx: Context<Checkout>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);
    let now = Clock::get()?.unix_timestamp;
    let config = &ctx.accounts.config;

    let v = valuate(
        &ctx.accounts.position,
        ctx.remaining_accounts,
        ctx.program_id,
        now,
        config.max_price_age,
    )?;
    let new_debt = ctx
        .accounts
        .position
        .debt
        .checked_add(amount)
        .ok_or(ErrorCode::Overflow)?;
    require!(new_debt <= v.borrow_limit, ErrorCode::InsufficientCredit);

    let fee = apply_bps(amount, config.merchant_fee_bps);
    let merchant_received = amount - fee;
    let seeds: &[&[u8]] = &[CONFIG_SEED, &[config.bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token::ID,
            Transfer {
                from: ctx.accounts.liquidity_vault.to_account_info(),
                to: ctx.accounts.merchant_usdc.to_account_info(),
                authority: ctx.accounts.config.to_account_info(),
            },
            &[seeds],
        ),
        merchant_received,
    )?;

    let installments = config.installments;
    let loan_key = ctx.accounts.loan.key();
    let position_key = ctx.accounts.position.key();
    let loan = &mut ctx.accounts.loan;
    loan.position = position_key;
    loan.owner = ctx.accounts.owner.key();
    loan.merchant = ctx.accounts.merchant.key();
    loan.index = ctx.accounts.position.loan_count;
    loan.principal = amount;
    loan.merchant_received = merchant_received;
    loan.installment_amount = amount / installments as u64;
    loan.installments_total = installments;
    loan.installments_paid = 0;
    loan.repaid = 0;
    loan.late_fees_paid = 0;
    loan.created_at = now;
    loan.next_due_at = now;
    loan.bump = ctx.bumps.loan;

    let p = &mut ctx.accounts.position;
    p.debt = new_debt;
    p.loan_count += 1;
    ctx.accounts.config.total_debt += amount;
    ctx.accounts.config.fees_earned += fee;

    emit!(CheckoutEvent {
        owner: p.owner,
        merchant: loan.merchant,
        loan: loan_key,
        principal: amount,
        merchant_received,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Repay<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(
        mut,
        seeds = [POSITION_SEED, owner.key().as_ref()],
        bump = position.bump,
        has_one = owner
    )]
    pub position: Box<Account<'info, Position>>,
    #[account(
        mut,
        seeds = [LOAN_SEED, position.key().as_ref(), &loan.index.to_le_bytes()],
        bump = loan.bump,
        has_one = position
    )]
    pub loan: Box<Account<'info, Loan>>,
    #[account(mut, token::mint = config.usdc_mint, token::authority = owner)]
    pub user_usdc: Box<Account<'info, TokenAccount>>,
    #[account(mut, address = config.liquidity_vault)]
    pub liquidity_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

/// Pays the next installment. Any credit left by a liquidation is applied first.
/// Past the grace period a late fee is added, paid in cash to liquidity providers.
pub fn handle_repay(ctx: Context<Repay>) -> Result<()> {
    let due = ctx.accounts.loan.next_installment()?;
    let now = Clock::get()?.unix_timestamp;
    let late = now > ctx.accounts.loan.next_due_at + ctx.accounts.config.grace_period;
    let late_fee = if late { apply_bps(due, ctx.accounts.config.late_fee_bps) } else { 0 };
    let p = &mut ctx.accounts.position;
    let from_credit = due.min(p.credit_balance);
    let cash = due - from_credit;

    if cash + late_fee > 0 {
        token::transfer(
            CpiContext::new(
                token::ID,
                Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.liquidity_vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            cash + late_fee,
        )?;
    }

    p.credit_balance -= from_credit;
    p.debt = p.debt.saturating_sub(cash);
    let config = &mut ctx.accounts.config;
    config.total_debt = config.total_debt.saturating_sub(cash);
    config.fees_earned += late_fee;

    let loan = &mut ctx.accounts.loan;
    loan.installments_paid += 1;
    loan.repaid += due;
    loan.late_fees_paid += late_fee;
    loan.next_due_at += config.installment_interval;

    emit!(RepayEvent {
        owner: p.owner,
        loan: loan.key(),
        installment: loan.installments_paid,
        paid: cash,
        from_credit,
        late_fee,
    });
    Ok(())
}
