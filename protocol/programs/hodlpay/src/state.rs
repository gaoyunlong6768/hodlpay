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
    pub bump: u8,
    pub vault_bump: u8,
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
    pub created_at: i64,
    pub next_due_at: i64,
    pub bump: u8,
}

impl Loan {
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
}
