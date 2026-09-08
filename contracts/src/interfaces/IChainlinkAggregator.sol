// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @notice Minimal subset of Chainlink's `AggregatorV3Interface` — just
/// enough for `StratusChainlinkPriceOracle` to read a staleness-checked
/// price. See https://docs.chain.link/data-feeds for the full interface.
interface IChainlinkAggregator {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
