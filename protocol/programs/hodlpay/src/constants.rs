use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const LIQUIDITY_SEED: &[u8] = b"liquidity";

#[constant]
pub const ASSET_SEED: &[u8] = b"asset";

#[constant]
pub const COLLATERAL_VAULT_SEED: &[u8] = b"collateral_vault";

#[constant]
pub const POSITION_SEED: &[u8] = b"position";

#[constant]
pub const LOAN_SEED: &[u8] = b"loan";

#[constant]
pub const LP_MINT_SEED: &[u8] = b"lp_mint";

#[constant]
pub const CREDIT_SEED: &[u8] = b"credit";

#[constant]
pub const PROTOCOL_SEED: &[u8] = b"protocol";

/// Treasury plus reserve share of fees; LPs always keep at least the rest.
#[constant]
pub const MAX_PROTOCOL_SHARE_BPS: u16 = 5_000;

/// USDC (base units) repaid on time per credit level.
#[constant]
pub const CREDIT_STEP: u64 = 250_000_000;

/// Max LTV added per credit level.
#[constant]
pub const CREDIT_STEP_BPS: u16 = 250;

#[constant]
pub const CREDIT_MAX_BONUS_BPS: u16 = 1_000;

/// A credit-boosted max LTV always stays this far below the asset's margin line.
#[constant]
pub const CREDIT_MARGIN_BUFFER_BPS: u16 = 500;

/// An installment builds credit only if paid at most this long before its due date,
/// so a record takes real time to earn instead of one prepayment.
#[constant]
pub const CREDIT_WINDOW: i64 = 7 * 86_400;

/// Collateral slots per position.
pub const MAX_ASSETS: usize = 4;

pub const BPS: u64 = 10_000;

/// Pyth Solana receiver; owns `PriceUpdateV2` accounts, including sponsored feeds.
pub const PYTH_RECEIVER_ID: Pubkey = pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

pub const PRICE_UPDATE_V2_DISCRIMINATOR: [u8; 8] = [34, 241, 35, 99, 157, 126, 244, 205];

/// Pyth updates with a confidence interval wider than this share of price are rejected.
pub const MAX_CONF_BPS: u64 = 200;
