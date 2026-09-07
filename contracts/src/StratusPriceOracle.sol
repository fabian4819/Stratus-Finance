// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracleGetter} from "./interfaces/IPriceOracleGetter.sol";
import {IPyth, PythStructs} from "./interfaces/IPyth.sol";

/// @title StratusPriceOracle
/// @notice Aave v2 `IPriceOracleGetter` implementation backed by live Pyth
/// Network price feeds on Hedera testnet. All prices are normalized to USD
/// with 18 decimals, applied consistently across every reserve — Aave v2
/// only requires internal consistency between reserves, not ETH
/// denomination, despite the interface's historical naming. See PLAN.md §1.4.
///
/// @dev DEMO-ONLY: `setDemoOffsetBps` lets the owner apply a visible,
/// event-logged offset to one asset's price, used solely to demonstrate
/// isolated liquidation on testnet without waiting for a real market crash
/// (we cannot manufacture a real gold crash). This is a deliberate,
/// documented exception to "nothing mocked on the critical path" — see
/// PLAN.md §6.3. Requirements if this is ever live:
///   1. owner MUST be a role the team controls and discloses, never left as
///      a throwaway EOA key that outlives the demo;
///   2. the frontend MUST show a persistent "DEMO PRICE STRESS ACTIVE"
///      banner whenever `isDemoStressed` is true for any asset;
///   3. every offset change emits `DemoOffsetSet`, so it is auditable from
///      logs even if the UI banner is missed.
contract StratusPriceOracle is IPriceOracleGetter, Ownable {
    uint256 public constant USD_DECIMALS = 18;

    IPyth public immutable pyth;
    uint256 public immutable maxPriceAge;

    mapping(address => bytes32) public feedIds;
    mapping(address => int256) public demoOffsetBps; // signed; e.g. -3000 = -30%

    event FeedSet(address indexed asset, bytes32 feedId);
    event DemoOffsetSet(address indexed asset, int256 offsetBps);

    constructor(address pyth_, uint256 maxPriceAge_) {
        require(pyth_ != address(0), "zero pyth");
        require(maxPriceAge_ > 0, "zero max age");
        pyth = IPyth(pyth_);
        maxPriceAge = maxPriceAge_;
    }

    function setFeed(address asset, bytes32 feedId) external onlyOwner {
        require(asset != address(0) && feedId != bytes32(0), "bad input");
        feedIds[asset] = feedId;
        emit FeedSet(asset, feedId);
    }

    /// @notice DEMO-ONLY (see contract-level docs). Applies a basis-point
    /// offset to the live Pyth price for `asset` so a specific reserve can
    /// be stressed into liquidation range on testnet. `offsetBps = 0`
    /// clears the stress.
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
        bytes32 feedId = feedIds[asset];
        require(feedId != bytes32(0), "no feed set for asset");

        PythStructs.Price memory p = pyth.getPriceNoOlderThan(feedId, maxPriceAge);
        require(p.price > 0, "non-positive price");

        uint256 price18 = _scaleTo18(uint256(uint64(p.price)), p.expo);

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

    /// @dev Pyth prices are `price * 10^expo`. Rescale to `USD_DECIMALS`.
    function _scaleTo18(uint256 rawPrice, int32 expo) internal pure returns (uint256) {
        int256 shift = int256(USD_DECIMALS) + int256(expo);
        if (shift >= 0) {
            return rawPrice * (10 ** uint256(shift));
        }
        return rawPrice / (10 ** uint256(-shift));
    }
}
