use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("LTV parameters must satisfy max < margin < liquidation < 100%")]
    InvalidLtv,
    #[msg("Invalid protocol parameter")]
    InvalidParam,
    #[msg("Price must be greater than zero")]
    InvalidPrice,
    #[msg("Oracle price is stale")]
    StalePrice,
    #[msg("Math overflow")]
    Overflow,
    #[msg("All collateral slots are in use")]
    PositionFull,
    #[msg("Collateral asset not found in position")]
    AssetNotInPosition,
    #[msg("Not enough collateral deposited")]
    InsufficientCollateral,
    #[msg("A collateral asset account required for valuation is missing")]
    MissingAssetAccount,
    #[msg("Not enough available credit")]
    InsufficientCredit,
    #[msg("Withdrawal would exceed the max LTV")]
    ExceedsMaxLtv,
    #[msg("Loan is already fully repaid")]
    LoanRepaid,
    #[msg("Position is not liquidatable")]
    NotLiquidatable,
    #[msg("Repay amount exceeds the close factor")]
    ExceedsCloseFactor,
    #[msg("Not enough idle liquidity: funds are lent out")]
    InsufficientLiquidity,
    #[msg("Invalid Pyth price update account")]
    InvalidPriceUpdate,
    #[msg("Price update is for a different feed")]
    FeedMismatch,
    #[msg("Oracle confidence interval too wide")]
    PriceUncertain,
    #[msg("Installment is not past its grace period")]
    NotOverdue,
    #[msg("Keeper prices are disabled in this build; use refresh_price")]
    KeeperPricesDisabled,
    #[msg("Purchase is above the per-loan limit")]
    OverLoanCap,
    #[msg("Protocol is at its total debt limit")]
    OverDebtCap,
    #[msg("Amount exceeds the treasury balance")]
    ExceedsTreasury,
}
