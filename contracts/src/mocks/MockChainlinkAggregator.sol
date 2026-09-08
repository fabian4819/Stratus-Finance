// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IChainlinkAggregator} from "../interfaces/IChainlinkAggregator.sol";

/// @title MockChainlinkAggregator
/// @notice Local test double for a Chainlink `AggregatorV3Interface` feed.
/// Lets unit/integration tests set exact prices without a live feed.
contract MockChainlinkAggregator is IChainlinkAggregator {
    uint8 internal immutable _decimals;
    int256 internal _answer;
    uint256 internal _updatedAt;
    uint80 internal _roundId;

    constructor(uint8 decimals_) {
        _decimals = decimals_;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function setAnswer(int256 answer_, uint256 updatedAt_) external {
        _answer = answer_;
        _updatedAt = updatedAt_;
        _roundId += 1;
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }
}
