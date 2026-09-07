// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {StratusBasketToken} from "./StratusBasketToken.sol";
import {ILendingPool} from "./interfaces/ILendingPool.sol";

/// @title StratusVault
/// @notice Decomposes a `StratusBasketToken` into two isolated per-asset
/// reserve positions on deposit, and recomposes it back on withdrawal. This
/// is the protocol's core original contribution — see PLAN.md §3.
///
/// @dev Deposits use Aave v2's `onBehalfOf` so aTokens (and any debt the
/// user later takes against them) live in the USER's own Aave account, not
/// the vault's. The vault holds no user funds outside the span of a single
/// transaction — see PLAN.md §1.3.
///
/// Aave v2 has no "withdraw on behalf of" — only the aToken holder
/// (msg.sender) can call `pool.withdraw`. So withdrawal is user-driven in
/// two steps rather than a single vault call:
///   1. the user calls `pool.withdraw(component, amount, <their wallet>)`
///      for each of the two components directly against the pool;
///   2. the user approves this vault for those exact amounts (see
///      `basketToken.previewComponents`) and calls `recomposeBasket`, which
///      pulls the underlying and mints the basket token back to them.
/// This keeps the vault out of the debt/collateral accounting path
/// entirely — it only ever touches the basket <-> underlying wrapping.
contract StratusVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant REFERRAL_CODE = 0;

    StratusBasketToken public immutable basketToken;
    ILendingPool public immutable pool;
    IERC20 public immutable componentA;
    IERC20 public immutable componentB;

    event BasketDecomposed(address indexed user, uint256 basketAmount, uint256 amountA, uint256 amountB);
    event BasketRecomposed(address indexed user, uint256 basketAmount, uint256 amountA, uint256 amountB);

    constructor(address basketToken_, address pool_) {
        require(basketToken_ != address(0) && pool_ != address(0), "zero address");

        basketToken = StratusBasketToken(basketToken_);
        pool = ILendingPool(pool_);
        componentA = basketToken.componentA();
        componentB = basketToken.componentB();

        // No component approval here, on purpose: when the components are
        // ATS diamonds, `approve()` itself reverts (AccountIsBlocked)
        // unless the caller granting the allowance is already on the
        // token's control list — and this vault can't be whitelisted
        // before it has an address, i.e. before construction finishes.
        // Approval is granted lazily on first use in `depositBasket`
        // instead, by which point deployment scripts have had the chance
        // to whitelist this vault. See docs/phase-2-findings.md.
    }

    /// @dev Grants `spender` a standing max allowance the first time it's
    /// needed, then no-ops on every subsequent call.
    function _ensureApproved(IERC20 token, address spender, uint256 amount) internal {
        if (token.allowance(address(this), spender) < amount) {
            token.safeApprove(spender, type(uint256).max);
        }
    }

    /// @notice Deposits `basketAmount` of the basket token, decomposing it
    /// into the two underlying reserves. aTokens for both reserves are
    /// minted directly to `msg.sender` via `onBehalfOf` — see contract docs.
    function depositBasket(uint256 basketAmount) external nonReentrant {
        require(basketAmount > 0, "zero amount");

        IERC20(address(basketToken)).safeTransferFrom(msg.sender, address(this), basketAmount);
        (uint256 amountA, uint256 amountB) = basketToken.redeem(basketAmount);

        _ensureApproved(componentA, address(pool), amountA);
        _ensureApproved(componentB, address(pool), amountB);

        pool.deposit(address(componentA), amountA, msg.sender, REFERRAL_CODE);
        pool.deposit(address(componentB), amountB, msg.sender, REFERRAL_CODE);

        emit BasketDecomposed(msg.sender, basketAmount, amountA, amountB);
    }

    /// @notice Recomposes `basketAmount` worth of already-withdrawn
    /// underlying (see contract-level docs, step 1) back into the basket
    /// token. Caller must have approved this vault for exactly the amounts
    /// returned by `basketToken.previewComponents(basketAmount)`.
    function recomposeBasket(uint256 basketAmount) external nonReentrant {
        require(basketAmount > 0, "zero amount");

        (uint256 amountA, uint256 amountB) = basketToken.previewComponents(basketAmount);
        componentA.safeTransferFrom(msg.sender, address(this), amountA);
        componentB.safeTransferFrom(msg.sender, address(this), amountB);

        componentA.safeApprove(address(basketToken), amountA);
        componentB.safeApprove(address(basketToken), amountB);
        basketToken.mint(basketAmount);

        IERC20(address(basketToken)).safeTransfer(msg.sender, basketAmount);

        emit BasketRecomposed(msg.sender, basketAmount, amountA, amountB);
    }
}
