// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ITIP20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferWithMemo(address to, uint256 amount, bytes32 memo) external;
    function balanceOf(address account) external view returns (uint256);
}

/// @title HodlPay merchant settlement on Tempo
/// @notice Pays merchants in a Tempo stablecoin for purchases financed by the
/// HodlPay credit program on Solana. Each Solana checkout can settle at most once;
/// its transaction signature hash is the payment memo, so merchants can reconcile
/// every Tempo payout against the on-chain loan that funded it.
contract HodlPaySettlement {
    address public owner;
    address public relayer;
    mapping(bytes32 => bool) public settled;
    uint256 public totalSettled;

    event Settled(bytes32 indexed checkoutRef, address indexed merchant, address indexed token, uint256 amount);
    event RelayerChanged(address relayer);

    error NotRelayer();
    error NotOwner();
    error AlreadySettled();
    error ZeroAmount();

    constructor(address relayer_) {
        owner = msg.sender;
        relayer = relayer_;
    }

    function setRelayer(address relayer_) external {
        if (msg.sender != owner) revert NotOwner();
        relayer = relayer_;
        emit RelayerChanged(relayer_);
    }

    /// @param checkoutRef keccak256 of the Solana checkout transaction signature.
    function settle(bytes32 checkoutRef, address merchant, address token, uint256 amount) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (settled[checkoutRef]) revert AlreadySettled();
        if (amount == 0) revert ZeroAmount();
        settled[checkoutRef] = true;
        totalSettled += amount;
        ITIP20(token).transferWithMemo(merchant, amount, checkoutRef);
        emit Settled(checkoutRef, merchant, token, amount);
    }

    /// @notice Returns unused settlement liquidity to the owner.
    function withdraw(address token, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        ITIP20(token).transfer(owner, amount);
    }
}
