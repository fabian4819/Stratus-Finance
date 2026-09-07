// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title StratusBasketToken
/// @notice ERC20 wrapper that actually holds two underlying RWA tokens at a
/// fixed ratio. Minting pulls the underlying pro rata from the caller;
/// redeeming burns the basket token and returns the underlying pro rata.
///
/// @dev This is deliberately a real collateral-backed wrapper, not a
/// synthetic price-tracking token: it makes "look-through" decomposition in
/// `StratusVault` a real on-chain transfer of assets the wrapper is
/// currently holding, not an accounting claim — see PLAN.md §1.1.
///
/// Both underlying tokens are assumed to use 18 decimals, matching this
/// token. Supporting arbitrary underlying decimals and >2-asset / custom
/// ratio baskets is noted as future work in PLAN.md §0.
contract StratusBasketToken is ERC20 {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable componentA;
    IERC20 public immutable componentB;
    uint256 public immutable ratioABps;
    uint256 public immutable ratioBBps;

    event Minted(address indexed by, uint256 basketAmount, uint256 amountA, uint256 amountB);
    event Redeemed(address indexed by, uint256 basketAmount, uint256 amountA, uint256 amountB);

    constructor(
        string memory name_,
        string memory symbol_,
        address componentA_,
        address componentB_,
        uint256 ratioABps_
    ) ERC20(name_, symbol_) {
        require(componentA_ != address(0) && componentB_ != address(0), "zero component");
        require(componentA_ != componentB_, "duplicate component");
        require(ratioABps_ > 0 && ratioABps_ < BPS_DENOMINATOR, "ratio out of range");

        componentA = IERC20(componentA_);
        componentB = IERC20(componentB_);
        ratioABps = ratioABps_;
        ratioBBps = BPS_DENOMINATOR - ratioABps_;
    }

    /// @notice The exact underlying amounts a given basket amount maps to.
    /// `mint` and `redeem` both derive from this same formula, so
    /// `redeem(x)` after `mint(x)` returns exactly the underlying `mint(x)`
    /// consumed — no rounding drift on a matched round trip. Dust can only
    /// accrue across mismatched partial amounts, which is expected and
    /// accepted at hackathon scope.
    function previewComponents(uint256 basketAmount) public view returns (uint256 amountA, uint256 amountB) {
        amountA = (basketAmount * ratioABps) / BPS_DENOMINATOR;
        amountB = (basketAmount * ratioBBps) / BPS_DENOMINATOR;
    }

    /// @notice Pulls the pro-rata underlying from the caller and mints
    /// `basketAmount` basket tokens to the caller.
    function mint(uint256 basketAmount) external returns (uint256 amountA, uint256 amountB) {
        require(basketAmount > 0, "zero amount");
        (amountA, amountB) = previewComponents(basketAmount);

        componentA.safeTransferFrom(msg.sender, address(this), amountA);
        componentB.safeTransferFrom(msg.sender, address(this), amountB);
        _mint(msg.sender, basketAmount);

        emit Minted(msg.sender, basketAmount, amountA, amountB);
    }

    /// @notice Burns `basketAmount` from the caller and returns the
    /// pro-rata underlying to the caller.
    function redeem(uint256 basketAmount) external returns (uint256 amountA, uint256 amountB) {
        require(basketAmount > 0, "zero amount");
        (amountA, amountB) = previewComponents(basketAmount);

        _burn(msg.sender, basketAmount);
        componentA.safeTransfer(msg.sender, amountA);
        componentB.safeTransfer(msg.sender, amountB);

        emit Redeemed(msg.sender, basketAmount, amountA, amountB);
    }
}
