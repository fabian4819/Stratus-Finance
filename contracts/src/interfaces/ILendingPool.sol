// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @notice Subset of Aave v2's `ILendingPool`, matching the forked Bonzo
/// pool's public interface (see contracts/lib/bonzo/SETUP.md). Only the
/// functions Stratus contracts call are declared here — this is a
/// consumer-side interface, not a redeclaration of the whole pool.
interface ILendingPool {
    function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;

    /// @dev Aave v2 has no "withdraw on behalf of" — only the aToken holder
    /// (msg.sender) can withdraw their own collateral. See StratusVault's
    /// contract-level docs for how this shapes the withdrawal flow.
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);

    function borrow(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        uint16 referralCode,
        address onBehalfOf
    ) external;

    function repay(address asset, uint256 amount, uint256 rateMode, address onBehalfOf) external returns (uint256);

    /// @notice Seizes collateral of `collateralAsset` only, up to
    /// `debtToCover` of `debtAsset` debt. This single-asset targeting is the
    /// isolation mechanism Stratus relies on — see PLAN.md §1.2.
    function liquidationCall(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover,
        bool receiveAToken
    ) external;

    /// @notice Portfolio-level account data. `healthFactor` here is the
    /// REAL, enforced health factor — the one that actually gates
    /// `liquidationCall`. All values are denominated in the pool's base
    /// currency (this deployment: USD, 18 decimals — see
    /// `StratusPriceOracle`), despite the Aave v2-inherited "ETH" naming.
    function getUserAccountData(
        address user
    )
        external
        view
        returns (
            uint256 totalCollateralETH,
            uint256 totalDebtETH,
            uint256 availableBorrowsETH,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );
}
