// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracleGetter} from "./interfaces/IPriceOracleGetter.sol";
import {IChainlinkAggregator} from "./interfaces/IChainlinkAggregator.sol";

/// @title StratusChainlinkPriceOracle
/// @notice Aave v2 `IPriceOracleGetter` implementation backed by live
/// Chainlink price feeds on Hedera testnet. Same external shape and demo
/// stress mechanism as `StratusPriceOracle` (Pyth-backed) — see that
/// contract's docs for the rationale — so the pool can be re-pointed
/// between the two via `LendingPoolAddressesProvider.setPriceOracle`
/// without any other change.
///
/// @dev PIVOT RATIONALE (PLAN.md Phase 2/4): `StratusPriceOracle` (Pyth)
/// is the originally designed oracle and remains in the codebase —
/// `updatePriceFeeds` works and is unit-tested — but pushing a fresh price
/// on Hedera testnet is blocked by Pyth infrastructure outside this
/// repo's control (Hermes now requires a paid-after-trial API key, and
/// even with a valid key, the on-chain Pyth contract rejects current
/// Hermes update data with `InvalidWormholeVaa()` — confirmed by calling
/// it directly, bypassing this codebase entirely; see
/// docs/phase-2-findings.md). Chainlink's Hedera testnet feeds are
/// **push-based**: a live, actively-maintained oracle network updates them
/// on-chain continuously (confirmed fresh — HBAR/USD updated within the
/// last hour at integration time), so reading them needs no update step,
/// no API key, and no per-call fee at all. This contract is what the pool
/// is actually wired to; `StratusPriceOracle` stays as the documented,
/// tested, Pyth-based design this protocol would use once that
/// infrastructure gap closes.
///
/// DEMO-ONLY: `setDemoOffsetBps` — see `StratusPriceOracle`'s docs for the
/// full rationale and the same three requirements (owner disclosed,
/// persistent UI banner, every change event-logged).
contract StratusChainlinkPriceOracle is IPriceOracleGetter, Ownable {
    uint256 public constant USD_DECIMALS = 18;

    uint256 public immutable maxPriceAge;

    mapping(address => IChainlinkAggregator) public feeds;
    mapping(address => int256) public demoOffsetBps; // signed; e.g. -3000 = -30%

    event FeedSet(address indexed asset, address indexed feed);
    event DemoOffsetSet(address indexed asset, int256 offsetBps);

    constructor(uint256 maxPriceAge_) {
        require(maxPriceAge_ > 0, "zero max age");
        maxPriceAge = maxPriceAge_;
    }

    function setFeed(address asset, address feed) external onlyOwner {
        require(asset != address(0) && feed != address(0), "bad input");
        feeds[asset] = IChainlinkAggregator(feed);
        emit FeedSet(asset, feed);
    }

    /// @notice DEMO-ONLY (see contract-level docs). `offsetBps = 0` clears the stress.
    function setDemoOffsetBps(address asset, int256 offsetBps) external onlyOwner {
        require(offsetBps > -10_000, "would zero or invert price");
        demoOffsetBps[asset] = offsetBps;
        emit DemoOffsetSet(asset, offsetBps);
    }

    function isDemoStressed(address asset) external view returns (bool) {
        return demoOffsetBps[asset] != 0;
    }

    /// @inheritdoc IPriceOracleGetter
    function getAssetPrice(address asset) public view override returns (uint256) {
        IChainlinkAggregator feed = feeds[asset];
        require(address(feed) != address(0), "no feed set for asset");

        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        require(answer > 0, "non-positive price");
        require(block.timestamp - updatedAt <= maxPriceAge, "stale price");

        uint256 price18 = _scaleTo18(uint256(answer), feed.decimals());

        int256 offset = demoOffsetBps[asset];
        if (offset != 0) {
            price18 = uint256((int256(price18) * (10_000 + offset)) / 10_000);
        }
        return price18;
    }

    function getAssetsPrices(address[] calldata assets) external view returns (uint256[] memory) {
        uint256[] memory prices = new uint256[](assets.length);
        for (uint256 i = 0; i < assets.length; i++) {
            prices[i] = getAssetPrice(assets[i]);
        }
        return prices;
    }

    /// @dev Chainlink prices are `answer * 10^-decimals`. Rescale to `USD_DECIMALS`.
    function _scaleTo18(uint256 rawPrice, uint8 feedDecimals) internal pure returns (uint256) {
        if (feedDecimals <= USD_DECIMALS) {
            return rawPrice * (10 ** uint256(USD_DECIMALS - feedDecimals));
        }
        return rawPrice / (10 ** uint256(feedDecimals - USD_DECIMALS));
    }
}
