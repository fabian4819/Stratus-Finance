// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @title IPriceOracleGetter
/// @notice Matches Aave v2's price oracle interface so `StratusPriceOracle`
/// plugs directly into the forked Bonzo/Aave v2 `LendingPoolAddressesProvider`
/// as its registered price oracle.
interface IPriceOracleGetter {
    function getAssetPrice(address asset) external view returns (uint256);

    function getAssetsPrices(address[] calldata assets) external view returns (uint256[] memory);
}
