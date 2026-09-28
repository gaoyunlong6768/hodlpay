use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::*};

#[derive(Accounts)]
pub struct RefreshPrice<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, seeds = [ASSET_SEED, asset.mint.as_ref()], bump = asset.bump)]
    pub asset: Box<Account<'info, CollateralAsset>>,
    /// CHECK: Pyth `PriceUpdateV2`; owner, discriminator, verification level and feed id are checked in the handler.
    #[account(owner = PYTH_RECEIVER_ID @ ErrorCode::InvalidPriceUpdate)]
    pub price_update: UncheckedAccount<'info>,
}

pub struct PythPrice {
    pub feed_id: [u8; 32],
    pub price: i64,
    pub conf: u64,
    pub exponent: i32,
    pub publish_time: i64,
}

/// Parses a fully verified `PriceUpdateV2` account (Pyth receiver layout).
pub fn parse_price_update(data: &[u8]) -> Result<PythPrice> {
    require!(
        data.len() >= 8 + 32 + 1 && data[..8] == PRICE_UPDATE_V2_DISCRIMINATOR,
        ErrorCode::InvalidPriceUpdate
    );
    // VerificationLevel: 0 = Partial { num_signatures: u8 }, 1 = Full.
    require!(data[40] == 1, ErrorCode::InvalidPriceUpdate);
    let m = &data[41..];
    require!(m.len() >= 32 + 8 + 8 + 4 + 8, ErrorCode::InvalidPriceUpdate);
    let i64_at = |o: usize| i64::from_le_bytes(m[o..o + 8].try_into().unwrap());
    Ok(PythPrice {
        feed_id: m[..32].try_into().unwrap(),
        price: i64_at(32),
        conf: u64::from_le_bytes(m[40..48].try_into().unwrap()),
        exponent: i32::from_le_bytes(m[48..52].try_into().unwrap()),
        publish_time: i64_at(52),
    })
}

/// Converts a Pyth price with `exponent` to 6-decimal USD.
pub fn to_e6(value: u64, exponent: i32) -> Result<u64> {
    let shift = 6 + exponent;
    let v = if shift >= 0 {
        (value as u128).checked_mul(10u128.pow(shift as u32)).ok_or(ErrorCode::Overflow)?
    } else {
        value as u128 / 10u128.pow((-shift) as u32)
    };
    u64::try_from(v).map_err(|_| error!(ErrorCode::Overflow))
}

/// Permissionless: anyone can move an asset's price to a newer verified Pyth update.
pub fn handle_refresh_price(ctx: Context<RefreshPrice>) -> Result<()> {
    let data = ctx.accounts.price_update.try_borrow_data()?;
    let p = parse_price_update(&data)?;
    let asset = &mut ctx.accounts.asset;
    require!(asset.pyth_feed_id != [0u8; 32], ErrorCode::FeedMismatch);
    require!(p.feed_id == asset.pyth_feed_id, ErrorCode::FeedMismatch);
    require!(p.price > 0, ErrorCode::InvalidPrice);
    let price = p.price as u64;
    require!(
        (p.conf as u128) * BPS as u128 <= (price as u128) * MAX_CONF_BPS as u128,
        ErrorCode::PriceUncertain
    );
    let now = Clock::get()?.unix_timestamp;
    require!(
        now.saturating_sub(p.publish_time) <= ctx.accounts.config.max_price_age,
        ErrorCode::StalePrice
    );
    if p.publish_time <= asset.price_updated_at {
        return Ok(());
    }
    let price_e6 = to_e6(price, p.exponent)?;
    require!(price_e6 > 0, ErrorCode::InvalidPrice);
    asset.price_e6 = price_e6;
    asset.price_updated_at = p.publish_time;
    Ok(())
}
