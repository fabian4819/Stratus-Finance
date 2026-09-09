// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracleGetter} from "./interfaces/IPriceOracleGetter.sol";

interface IATSControlList {
    function addToControlList(address _account) external returns (bool);
    function isInControlList(address _account) external view returns (bool);
}

/// @title StratusMarketplace
/// @notice Lets any wallet buy GOLD-x/STOCK-x/individual-stock tokens
/// directly with USDC, priced at the protocol's live oracle — fully
/// self-serve, no admin action needed per buyer.
///
/// @dev ATS enforces control-list whitelisting on every transfer — a
/// brand-new wallet has never been whitelisted on any of these tokens,
/// so a plain `transfer()` to them would revert with `AccountIsBlocked`
/// (the same friction documented in docs/ats-friction.md /
/// https://github.com/hashgraph/asset-tokenization-studio/issues/1399).
/// This contract is granted `ROLE_CONTROL_LIST` on each sellable token
/// (see script/09-setup-marketplace.ts) specifically so it can whitelist
/// a first-time buyer atomically inside the same `buy()` transaction —
/// no separate admin step, no waiting.
///
/// Inventory sold comes from a balance pre-funded into this contract
/// (transferred from the admin's existing pre-minted supply) — this
/// contract does not mint. Selling out of `sellable[token]` is an owner
/// decision (`setSellable`), independent of whether inventory remains.
contract StratusMarketplace is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IPriceOracleGetter public immutable oracle;
    uint256 internal constant USD_DECIMALS = 18;
    uint256 internal constant USDC_DECIMALS = 6;

    // All sellable tokens (GOLD-x, STOCK-x, the 10 individual stocks) are
    // 18-decimal ATS Equity tokens — see tokenization/config/*.json.
    uint256 internal constant TOKEN_DECIMALS = 18;

    mapping(address => bool) public sellable;

    event Sold(address indexed token, address indexed buyer, uint256 tokenAmount, uint256 usdcPaid);
    event SellableSet(address indexed token, bool isSellable);

    constructor(address usdc_, address oracle_) {
        require(usdc_ != address(0) && oracle_ != address(0), "zero address");
        usdc = IERC20(usdc_);
        oracle = IPriceOracleGetter(oracle_);
    }

    function setSellable(address token, bool isSellable) external onlyOwner {
        sellable[token] = isSellable;
        emit SellableSet(token, isSellable);
    }

    /// @notice Quotes the USDC cost (6 decimals) for `tokenAmount` (18 decimals) of `token`.
    function quote(address token, uint256 tokenAmount) public view returns (uint256 usdcCost) {
        uint256 price18 = oracle.getAssetPrice(token); // USD, 18 decimals
        uint256 usd18 = (tokenAmount * price18) / (10 ** TOKEN_DECIMALS);
        usdcCost = usd18 / (10 ** (USD_DECIMALS - USDC_DECIMALS));
    }

    /// @notice Buys `tokenAmount` of `token` with USDC at the current
    /// oracle price. Caller must have approved this contract for at
    /// least the USDC cost (call quote() first to know how much).
    /// Whitelists the caller on `token`'s ATS control list automatically
    /// if this is their first time — no separate admin step.
    function buy(address token, uint256 tokenAmount) external {
        require(sellable[token], "not sellable");
        require(tokenAmount > 0, "zero amount");
        uint256 usdcCost = quote(token, tokenAmount);
        require(usdcCost > 0, "amount too small");

        usdc.safeTransferFrom(msg.sender, address(this), usdcCost);

        // ATS's addToControlList reverts (rather than no-op) if the
        // account is already whitelisted — same guard used throughout
        // this codebase's own whitelisting scripts.
        if (!IATSControlList(token).isInControlList(msg.sender)) {
            IATSControlList(token).addToControlList(msg.sender);
        }

        IERC20(token).safeTransfer(msg.sender, tokenAmount);
        emit Sold(token, msg.sender, tokenAmount, usdcCost);
    }

    /// @notice Owner-only: withdraw USDC proceeds, or pull back unsold
    /// token inventory. Does not touch a buyer's own balance.
    function withdraw(address token, uint256 amount, address to) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
