use anchor_lang::prelude::*;

use crate::{
    constants::BPS,
    error::ErrorCode,
    state::{CollateralAsset, Position},
};

pub struct Valuation {
    pub collateral_value: u64,
    pub borrow_limit: u64,
    pub margin_limit: u64,
    pub liquidation_limit: u64,
}

/// USD value (6 decimals) of `amount` base units at `price_e6` per whole token.
pub fn value_e6(amount: u64, price_e6: u64, decimals: u8) -> Result<u64> {
    let v = (amount as u128)
        .checked_mul(price_e6 as u128)
        .ok_or(ErrorCode::Overflow)?
        / 10u128.pow(decimals as u32);
    u64::try_from(v).map_err(|_| error!(ErrorCode::Overflow))
}

/// Base units of a token worth `value` USD (6 decimals).
pub fn amount_for_value(value: u64, price_e6: u64, decimals: u8) -> Result<u64> {
    let a = (value as u128)
        .checked_mul(10u128.pow(decimals as u32))
        .ok_or(ErrorCode::Overflow)?
        / price_e6 as u128;
    u64::try_from(a).map_err(|_| error!(ErrorCode::Overflow))
}

pub fn apply_bps(v: u64, bps: u16) -> u64 {
    ((v as u128) * bps as u128 / BPS as u128) as u64
}

pub fn read_asset(info: &AccountInfo, program_id: &Pubkey) -> Result<CollateralAsset> {
    require_keys_eq!(*info.owner, *program_id, ErrorCode::MissingAssetAccount);
    let data = info.try_borrow_data()?;
    CollateralAsset::try_deserialize(&mut &data[..])
}

/// Values every collateral slot in `position`. `assets` must contain the
/// `CollateralAsset` account for each non-empty slot.
pub fn valuate(
    position: &Position,
    assets: &[AccountInfo],
    program_id: &Pubkey,
    now: i64,
    max_price_age: i64,
) -> Result<Valuation> {
    let parsed = assets
        .iter()
        .filter(|a| a.owner == program_id)
        .filter_map(|a| read_asset(a, program_id).ok())
        .collect::<Vec<_>>();

    let mut v = Valuation {
        collateral_value: 0,
        borrow_limit: 0,
        margin_limit: 0,
        liquidation_limit: 0,
    };
    for (mint, amount) in position.mints.iter().zip(position.amounts.iter()) {
        if *amount == 0 {
            continue;
        }
        let asset = parsed
            .iter()
            .find(|a| a.mint == *mint)
            .ok_or(ErrorCode::MissingAssetAccount)?;
        require!(
            now.saturating_sub(asset.price_updated_at) <= max_price_age,
            ErrorCode::StalePrice
        );
        let value = value_e6(*amount, asset.price_e6, asset.decimals)?;
        v.collateral_value = v.collateral_value.checked_add(value).ok_or(ErrorCode::Overflow)?;
        v.borrow_limit += apply_bps(value, asset.max_ltv_bps);
        v.margin_limit += apply_bps(value, asset.margin_ltv_bps);
        v.liquidation_limit += apply_bps(value, asset.liquidation_ltv_bps);
    }
    Ok(v)
}
