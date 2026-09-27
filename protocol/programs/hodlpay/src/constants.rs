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

/// Collateral slots per position.
pub const MAX_ASSETS: usize = 4;

pub const BPS: u64 = 10_000;
