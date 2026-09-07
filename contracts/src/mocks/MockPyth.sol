// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IPyth, PythStructs} from "../interfaces/IPyth.sol";

/// @title MockPyth
/// @notice Local test double for Pyth Network's on-chain contract. Lets
/// unit/integration tests set exact prices — including stressed/crashed
/// values for the isolated-liquidation scenario — without touching the
/// real testnet oracle. Never deployed to testnet: `StratusPriceOracle`
/// there points at the real Pyth contract, and price stress on testnet
/// goes through its own `setDemoOffsetBps` (see PLAN.md §6.3), not this.
contract MockPyth is IPyth {
    mapping(bytes32 => PythStructs.Price) internal prices;

    function setPrice(bytes32 id, int64 price, uint64 conf, int32 expo, uint256 publishTime) external {
        prices[id] = PythStructs.Price({price: price, conf: conf, expo: expo, publishTime: publishTime});
    }

    function getPriceNoOlderThan(
        bytes32 id,
        uint256 age
    ) external view override returns (PythStructs.Price memory price) {
        price = prices[id];
        require(price.publishTime != 0, "no price set");
        require(block.timestamp - price.publishTime <= age, "stale price");
    }

    function getPriceUnsafe(bytes32 id) external view override returns (PythStructs.Price memory price) {
        price = prices[id];
        require(price.publishTime != 0, "no price set");
    }
}
