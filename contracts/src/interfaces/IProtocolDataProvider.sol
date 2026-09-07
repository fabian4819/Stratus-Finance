// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @notice Subset of Aave v2's `AaveProtocolDataProvider`, matching the
/// forked Bonzo deployment's equivalent contract. Exposes reserve
/// configuration and per-user reserve data already decoded from Aave v2's
/// packed `ReserveConfigurationMap` bitmap, so `StratusRiskView` doesn't
/// need to reimplement that bit-packing logic itself.
interface IProtocolDataProvider {
    function getReserveConfigurationData(
        address asset
    )
        external
        view
        returns (
            uint256 decimals,
            uint256 ltv,
            uint256 liquidationThreshold,
            uint256 liquidationBonus,
            uint256 reserveFactor,
            bool usageAsCollateralEnabled,
            bool borrowingEnabled,
            bool stableBorrowRateEnabled,
            bool isActive,
            bool isFrozen
        );

    function getUserReserveData(
        address asset,
        address user
    )
        external
        view
        returns (
            uint256 currentATokenBalance,
            uint256 currentStableDebt,
            uint256 currentVariableDebt,
            uint256 principalStableDebt,
            uint256 scaledVariableDebt,
            uint256 stableBorrowRate,
            uint256 liquidityRate,
            uint40 stableRateLastUpdated,
            bool usageAsCollateralEnabled
        );

    function getReserveTokensAddresses(
        address asset
    )
        external
        view
        returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress);
}
