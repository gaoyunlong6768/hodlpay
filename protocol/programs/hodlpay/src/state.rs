use anchor_lang::prelude::*;

use crate::{constants::MAX_ASSETS, error::ErrorCode};

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Posts oracle prices and runs liquidations.
    pub keeper: Pubkey,
    pub usdc_mint: Pubkey,
    pub liquidity_vault: Pubkey,
    pub merchant_fee_bps: u16,
    pub liquidation_bonus_bps: u16,
    /// Max share of debt a single liquidation may repay.
    pub close_factor_bps: u16,
    pub installments: u8,
    pub installment_interval: i64,
    pub max_price_age: i64,
    pub total_debt: u64,
    /// Share token for liquidity providers; pool value = idle liquidity + outstanding debt.
    pub lp_mint: Pubkey,
    /// Charged on an installment paid later than `next_due_at + grace_period`.
    pub late_fee_bps: u16,
    pub grace_period: i64,
    /// Lifetime merchant fees + late fees accrued to liquidity providers.
    pub fees_earned: u64,
    /// Merchant fees on open loans, earned installment by installment. Excluded
    /// from pool value so LPs cannot capture a fee by depositing around a checkout.
    pub unearned_fees: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl Config {
    pub fn pool_value(&self, idle: u64) -> Result<u64> {
        idle.checked_add(self.total_debt)
            .and_then(|v| v.checked_sub(self.unearned_fees))
            .ok_or(error!(ErrorCode::Overflow))
    }
}

#[account]
#[derive(InitSpace)]
pub struct CollateralAsset {
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub decimals: u8,
    /// USD price of one whole token, 6 decimals.
    pub price_e6: u64,
    pub price_updated_at: i64,
    pub max_ltv_bps: u16,
    pub margin_ltv_bps: u16,
    pub liquidation_ltv_bps: u16,
    pub total_deposited: u64,
    /// Pyth feed id; all zeros means keeper-posted prices only.
    pub pyth_feed_id: [u8; 32],
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub mints: [Pubkey; MAX_ASSETS],
    pub amounts: [u64; MAX_ASSETS],
    /// Outstanding debt in USDC base units.
    pub debt: u64,
    /// Debt already covered by liquidations, consumed by upcoming installments.
    pub credit_balance: u64,
    pub loan_count: u32,
    pub bump: u8,
}

impl Position {
    pub fn slot_of(&self, mint: &Pubkey) -> Option<usize> {
        self.mints.iter().position(|m| m == mint)
    }

    pub fn slot_for_deposit(&self, mint: &Pubkey) -> Result<usize> {
        if let Some(i) = self.slot_of(mint) {
            return Ok(i);
        }
        self.mints
            .iter()
            .position(|m| *m == Pubkey::default())
            .ok_or(error!(ErrorCode::PositionFull))
    }
}

#[account]
#[derive(InitSpace)]
pub struct Loan {
    pub position: Pubkey,
    pub owner: Pubkey,
    pub merchant: Pubkey,
    pub index: u32,
    pub principal: u64,
    pub merchant_received: u64,
    pub installment_amount: u64,
    pub installments_total: u8,
    pub installments_paid: u8,
    pub repaid: u64,
    pub late_fees_paid: u64,
    pub fee: u64,
    pub fee_earned: u64,
    pub created_at: i64,
    pub next_due_at: i64,
    pub bump: u8,
}

impl Loan {
    /// Share of the merchant fee earned by paying `due`; the last installment earns the rest.
    pub fn fee_for(&self, due: u64) -> u64 {
        if self.installments_paid + 1 == self.installments_total {
            self.fee - self.fee_earned
        } else {
            ((self.fee as u128) * due as u128 / self.principal as u128) as u64
        }
    }

    pub fn next_installment(&self) -> Result<u64> {
        require!(self.installments_paid < self.installments_total, ErrorCode::LoanRepaid);
        if self.installments_paid + 1 == self.installments_total {
            Ok(self.principal - self.repaid)
        } else {
            Ok(self.installment_amount)
        }
    }
}

#[event]
pub struct CheckoutEvent {
    pub owner: Pubkey,
    pub merchant: Pubkey,
    pub loan: Pubkey,
    pub principal: u64,
    pub merchant_received: u64,
}

#[event]
pub struct RepayEvent {
    pub owner: Pubkey,
    pub loan: Pubkey,
    pub installment: u8,
    pub paid: u64,
    pub from_credit: u64,
    pub late_fee: u64,
}

#[event]
pub struct LiquidityEvent {
    pub provider: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub deposit: bool,
}

#[event]
pub struct MarginEvent {
    pub owner: Pubkey,
    pub debt: u64,
    pub margin_limit: u64,
}

#[event]
pub struct LiquidationEvent {
    pub owner: Pubkey,
    pub liquidator: Pubkey,
    pub mint: Pubkey,
    pub repaid: u64,
    pub seized: u64,
    /// Debt written off because the position has no collateral left.
    pub bad_debt: u64,
}
