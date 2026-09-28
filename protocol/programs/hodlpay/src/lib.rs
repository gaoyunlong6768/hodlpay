pub mod constants;
pub mod error;
pub mod instructions;
pub mod math;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("5WWDSNYRjmU3Jp7DywyYgDYtYiBBZ3e8JmcBgS2HxihH");

#[program]
pub mod hodlpay {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
        admin::handle_initialize(ctx, args)
    }

    pub fn set_keeper(ctx: Context<SetKeeper>, keeper: Pubkey) -> Result<()> {
        admin::handle_set_keeper(ctx, keeper)
    }

    pub fn add_asset(ctx: Context<AddAsset>, args: AddAssetArgs) -> Result<()> {
        admin::handle_add_asset(ctx, args)
    }

    pub fn update_price(ctx: Context<UpdatePrice>, price_e6: u64) -> Result<()> {
        admin::handle_update_price(ctx, price_e6)
    }

    pub fn refresh_price(ctx: Context<RefreshPrice>) -> Result<()> {
        oracle::handle_refresh_price(ctx)
    }

    pub fn deposit_liquidity(ctx: Context<ProvideLiquidity>, amount: u64) -> Result<()> {
        pool::handle_deposit_liquidity(ctx, amount)
    }

    pub fn withdraw_liquidity(ctx: Context<ProvideLiquidity>, shares: u64) -> Result<()> {
        pool::handle_withdraw_liquidity(ctx, shares)
    }

    pub fn open_position(ctx: Context<OpenPosition>) -> Result<()> {
        position::handle_open_position(ctx)
    }

    pub fn deposit(ctx: Context<MoveCollateral>, amount: u64) -> Result<()> {
        position::handle_deposit(ctx, amount)
    }

    pub fn withdraw(ctx: Context<MoveCollateral>, amount: u64) -> Result<()> {
        position::handle_withdraw(ctx, amount)
    }

    pub fn checkout(ctx: Context<Checkout>, amount: u64) -> Result<()> {
        credit::handle_checkout(ctx, amount)
    }

    pub fn repay(ctx: Context<Repay>) -> Result<()> {
        credit::handle_repay(ctx)
    }

    pub fn liquidate(ctx: Context<Liquidate>, repay_amount: u64) -> Result<()> {
        liquidate::handle_liquidate(ctx, repay_amount)
    }

    pub fn check_health(ctx: Context<CheckHealth>) -> Result<()> {
        liquidate::handle_check_health(ctx)
    }
}
