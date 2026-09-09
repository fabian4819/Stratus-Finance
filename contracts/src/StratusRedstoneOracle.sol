// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PrimaryProdDataServiceConsumerBase} from
    "@redstone-finance/evm-connector/contracts/data-services/PrimaryProdDataServiceConsumerBase.sol";
import {IPriceOracleGetter} from "./interfaces/IPriceOracleGetter.sol";

/// @title StratusRedstoneOracle
/// @notice Aave v2 `IPriceOracleGetter` implementation backed by RedStone's
/// real-world-asset price feeds — GOLD-x reads the actual `XAU` (gold spot)
/// feed and STOCK-x reads the actual `USA500.Y` (S&P 500 index) feed, both
/// confirmed live on RedStone's `redstone-primary-prod` data service (see
/// docs/phase-3-oracle-research.md). This closes the "disclosed substitute"
/// gap in `StratusChainlinkPriceOracle`/`StratusPriceOracle`, where GOLD-x
/// and STOCK-x tracked HBAR/USD and ETH/USD respectively because no RWA
/// feed was live on Hedera testnet from Chainlink, Supra, or (blocked)
/// Pyth.
///
/// @dev ARCHITECTURE — RedStone is a *pull* oracle: a price is only
/// readable inside the exact external call whose calldata carries a
/// RedStone-signed data payload appended after the ABI-encoded arguments
/// (`getOracleNumericValueFromTxMsg`, from `RedstoneConsumerNumericBase`).
/// That payload does NOT propagate through an internal Solidity call —
/// `StratusRiskView`/`LendingPool` call `getAssetPrice(asset)` as a plain
/// internal call with no wrapped payload, so `getAssetPrice` itself cannot
/// read fresh RedStone data directly.
///
/// This contract resolves that with a cache: `updatePrice(asset)` is the
/// only function that reads `getOracleNumericValueFromTxMsg` — it must be
/// called directly (not through another contract) via a transaction whose
/// calldata was wrapped client-side with `WrapperBuilder` (RedStone's SDK),
/// and it stores the extracted price + timestamp. `getAssetPrice(asset)`
/// (the `IPriceOracleGetter`-facing function everything else calls) just
/// reads that cache and checks staleness against `maxPriceAge` — an
/// ordinary view call, identical in shape to `StratusChainlinkPriceOracle`,
/// so nothing downstream (pool, RiskView, frontend) needs RedStone-specific
/// wrapping. `updatePrice` is permissionless (anyone can refresh — the
/// data is cryptographically signed by RedStone's own signers, so there's
/// nothing to gain by calling it with bad data) but MUST be run
/// periodically by an off-chain script for prices to stay fresh — this is
/// an operational requirement, not a one-time setup step. See
/// `script/update-redstone-prices.ts`.
///
/// DEMO-ONLY: `setDemoOffsetBps` — see `StratusPriceOracle`'s docs for the
/// full rationale and the same three requirements (owner disclosed,
/// persistent UI banner, every change event-logged).
contract StratusRedstoneOracle is IPriceOracleGetter, PrimaryProdDataServiceConsumerBase, Ownable {
    uint256 public constant REDSTONE_DECIMALS = 8;
    uint256 public constant USD_DECIMALS = 18;

    uint256 public immutable maxPriceAge;

    mapping(address => bytes32) public feedIds;
    mapping(address => uint256) public cachedPrice18;
    mapping(address => uint256) public cachedPriceTimestamp;
    mapping(address => int256) public demoOffsetBps; // signed; e.g. -3000 = -30%

    event FeedIdSet(address indexed asset, bytes32 feedId);
    event PriceUpdated(address indexed asset, uint256 price18, uint256 timestamp);
    event DemoOffsetSet(address indexed asset, int256 offsetBps);

    constructor(uint256 maxPriceAge_) {
        require(maxPriceAge_ > 0, "zero max age");
        maxPriceAge = maxPriceAge_;
    }

    function setFeedId(address asset, bytes32 feedId) external onlyOwner {
        require(asset != address(0) && feedId != bytes32(0), "bad input");
        feedIds[asset] = feedId;
        emit FeedIdSet(asset, feedId);
    }

    /// @notice Reads a fresh RedStone-signed price for `asset` out of this
    /// call's own calldata and caches it. Must be called via a
    /// RedStone-wrapped transaction (see script/update-redstone-prices.ts)
    /// — calling it unwrapped reverts inside `getOracleNumericValueFromTxMsg`.
    /// Permissionless by design: the price is cryptographically signed by
    /// RedStone's authorised signers, so an unwrapped or forged call simply
    /// fails signature/threshold checks rather than admitting bad data.
    function updatePrice(address asset) external {
        bytes32 feedId = feedIds[asset];
        require(feedId != bytes32(0), "no feed set for asset");

        uint256 rawPrice = getOracleNumericValueFromTxMsg(feedId);
        uint256 price18 = rawPrice * (10 ** (USD_DECIMALS - REDSTONE_DECIMALS));

        cachedPrice18[asset] = price18;
        cachedPriceTimestamp[asset] = block.timestamp;
        emit PriceUpdated(asset, price18, block.timestamp);
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
        uint256 timestamp = cachedPriceTimestamp[asset];
        require(timestamp != 0, "no price cached yet");
        require(block.timestamp >= timestamp, "future cached timestamp");
        require(block.timestamp - timestamp <= maxPriceAge, "stale price");

        uint256 price18 = cachedPrice18[asset];

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
}
