// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ITIP20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferWithMemo(address to, uint256 amount, bytes32 memo) external;
    function balanceOf(address account) external view returns (uint256);
}

/// @title HodlPay merchant settlement on Tempo
/// @notice Pays merchants in a Tempo stablecoin for purchases financed by the
/// HodlPay credit program on Solana. A payout needs EIP-712 signatures from a
/// threshold of independent attesters, each of which verifies the Solana checkout
/// before signing; anyone may submit it. Each checkout settles at most once, its
/// transaction signature hash is the payment memo, and per-payout and rolling
/// 24-hour caps bound the loss if attesters were ever compromised.
contract HodlPaySettlement {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant SETTLE_TYPEHASH =
        keccak256("Settle(bytes32 checkoutRef,address merchant,address token,uint256 amount)");
    uint256 private constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    address public owner;
    address public guardian;
    bool public paused;

    mapping(address => bool) public isAttester;
    address[] private attesterList;
    uint8 public threshold;

    uint256 public maxPerSettlement;
    uint256 public dailyLimit;
    uint256 public windowStart;
    uint256 public windowSpent;

    mapping(bytes32 => bool) public settled;
    uint256 public totalSettled;

    event Settled(bytes32 indexed checkoutRef, address indexed merchant, address indexed token, uint256 amount);
    event Attested(bytes32 indexed checkoutRef, address[] signers, address submitter);
    event AttestersChanged(address[] attesters, uint8 threshold);
    event LimitsChanged(uint256 maxPerSettlement, uint256 dailyLimit);
    event Paused(bool paused);

    error NotOwner();
    error NotGuardian();
    error IsPaused();
    error AlreadySettled();
    error ZeroAmount();
    error OverPayoutCap();
    error OverDailyLimit();
    error BadSignature();
    error SignersNotSorted();
    error NotAttester(address signer);
    error BelowThreshold();
    error BadConfig();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address[] memory attesters, uint8 threshold_, uint256 maxPerSettlement_, uint256 dailyLimit_) {
        owner = msg.sender;
        guardian = msg.sender;
        _setAttesters(attesters, threshold_);
        _setLimits(maxPerSettlement_, dailyLimit_);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("HodlPaySettlement"), keccak256("2"), block.chainid, address(this))
        );
    }

    function settlementDigest(bytes32 checkoutRef, address merchant, address token, uint256 amount)
        public
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(SETTLE_TYPEHASH, checkoutRef, merchant, token, amount));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// @param checkoutRef keccak256 of the Solana checkout transaction signature (base58 string bytes).
    /// @param signatures 65-byte attester signatures over `settlementDigest`, sorted by signer address.
    function settle(bytes32 checkoutRef, address merchant, address token, uint256 amount, bytes[] calldata signatures)
        external
    {
        if (paused) revert IsPaused();
        if (settled[checkoutRef]) revert AlreadySettled();
        if (amount == 0) revert ZeroAmount();
        if (amount > maxPerSettlement) revert OverPayoutCap();

        bytes32 digest = settlementDigest(checkoutRef, merchant, token, amount);
        address[] memory signers = new address[](signatures.length);
        address last;
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = _recover(digest, signatures[i]);
            if (signer <= last) revert SignersNotSorted();
            if (!isAttester[signer]) revert NotAttester(signer);
            signers[i] = signer;
            last = signer;
        }
        if (signatures.length < threshold) revert BelowThreshold();

        if (block.timestamp >= windowStart + 1 days) {
            windowStart = block.timestamp;
            windowSpent = 0;
        }
        if (windowSpent + amount > dailyLimit) revert OverDailyLimit();
        windowSpent += amount;

        settled[checkoutRef] = true;
        totalSettled += amount;
        ITIP20(token).transferWithMemo(merchant, amount, checkoutRef);
        emit Settled(checkoutRef, merchant, token, amount);
        emit Attested(checkoutRef, signers, msg.sender);
    }

    function attesters() external view returns (address[] memory) {
        return attesterList;
    }

    function setAttesters(address[] calldata attesters_, uint8 threshold_) external onlyOwner {
        _setAttesters(attesters_, threshold_);
    }

    function setLimits(uint256 maxPerSettlement_, uint256 dailyLimit_) external onlyOwner {
        _setLimits(maxPerSettlement_, dailyLimit_);
    }

    function setGuardian(address guardian_) external onlyOwner {
        guardian = guardian_;
    }

    function transferOwnership(address owner_) external onlyOwner {
        owner = owner_;
    }

    /// @notice The guardian can halt payouts instantly; only the owner can resume them.
    function pause() external {
        if (msg.sender != guardian && msg.sender != owner) revert NotGuardian();
        paused = true;
        emit Paused(true);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Paused(false);
    }

    /// @notice Returns unused settlement liquidity to the owner.
    function withdraw(address token, uint256 amount) external onlyOwner {
        ITIP20(token).transfer(owner, amount);
    }

    function _setAttesters(address[] memory attesters_, uint8 threshold_) private {
        if (threshold_ == 0 || threshold_ > attesters_.length) revert BadConfig();
        for (uint256 i = 0; i < attesterList.length; i++) isAttester[attesterList[i]] = false;
        delete attesterList;
        for (uint256 i = 0; i < attesters_.length; i++) {
            if (attesters_[i] == address(0) || isAttester[attesters_[i]]) revert BadConfig();
            isAttester[attesters_[i]] = true;
            attesterList.push(attesters_[i]);
        }
        threshold = threshold_;
        emit AttestersChanged(attesters_, threshold_);
    }

    function _setLimits(uint256 maxPerSettlement_, uint256 dailyLimit_) private {
        if (maxPerSettlement_ == 0 || dailyLimit_ < maxPerSettlement_) revert BadConfig();
        maxPerSettlement = maxPerSettlement_;
        dailyLimit = dailyLimit_;
        emit LimitsChanged(maxPerSettlement_, dailyLimit_);
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address signer) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > HALF_N || (v != 27 && v != 28)) revert BadSignature();
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
    }
}
