// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

/// @notice Minimal subset of Pyth Network's on-chain interface — just enough
/// for `StratusPriceOracle` to read a staleness-checked price. See
/// https://docs.pyth.network/price-feeds for the full interface.
library PythStructs {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }
}

interface IPyth {
    /// @notice Returns the cached price for `id`, reverting if it is older
    /// than `age` seconds. This is the call used on the liquidation-critical
    /// path — never serve a stale price into a health-factor calculation.
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (PythStructs.Price memory price);

    /// @notice Returns the cached price for `id` with no staleness check.
    /// Display-only (e.g. "last updated Xs ago" in the UI) — never used for
    /// anything that gates borrowing or liquidation.
    function getPriceUnsafe(bytes32 id) external view returns (PythStructs.Price memory price);

    /// @notice Pushes fresh price updates (Hermes VAAs) into Pyth's
    /// on-chain cache. Required on Hedera testnet: confirmed in
    /// PLAN.md Phase 0 that nothing else keeps these feeds warm — every
    /// feed checked was stale by hours to months — so this must be called
    /// before any `getPriceNoOlderThan` read that needs to succeed. See
    /// `StratusPriceOracle.updatePriceFeeds`.
    function updatePriceFeeds(bytes[] calldata updateData) external payable;

    /// @notice The HBAR fee (in tinybar/wei terms, matching msg.value)
    /// required to submit `updateData` via `updatePriceFeeds`.
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256 feeAmount);
}
