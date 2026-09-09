// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {PrimaryProdDataServiceConsumerBase} from
    "@redstone-finance/evm-connector/contracts/data-services/PrimaryProdDataServiceConsumerBase.sol";

/// @title StratusLivePriceReader
/// @notice Standalone, read-only helper for genuinely real-time price
/// display in the frontend — completely separate from
/// StratusRedstoneOracle (the pool's actual price source). That contract
/// is necessarily a cache: `getOracleNumericValueFromTxMsg` only works
/// inside the exact external call whose calldata carries a RedStone-signed
/// payload, and that payload does not propagate through the internal
/// Solidity calls `LendingPool`/`StratusRiskView` make when they read a
/// price — see StratusRedstoneOracle.sol's docs for the full rationale.
///
/// This contract has no state, is never called by the pool, RiskView, or
/// any deposit/borrow/liquidation path, and is not the pool's price
/// oracle. It exists purely so the frontend can show a live-market price
/// without waiting on `script/update-redstone-prices.ts` — call it wrapped
/// with `WrapperBuilder` (a plain `eth_call`, no gas, no transaction) and
/// get the current signed RedStone value directly. Changing, breaking, or
/// removing this contract can never affect the lending protocol.
///
/// DEMO STRESS DISCLOSURE: this reader always returns RedStone's true,
/// unmodified live price — it does NOT apply `StratusRedstoneOracle`'s
/// demo-stress offset. That's deliberate: the live reader is "what the
/// market actually says right now," while the demo-stress banner
/// elsewhere in the UI discloses when the protocol's own cached price
/// (used for real deposit/borrow/liquidation math) has been deliberately
/// offset for a demo scenario. Showing both concepts under one number
/// would blur that disclosure.
contract StratusLivePriceReader is PrimaryProdDataServiceConsumerBase {
    function getLivePrice(bytes32 feedId) external view returns (uint256) {
        return getOracleNumericValueFromTxMsg(feedId);
    }

    /// @notice Batched version — one wrapped call, one gateway round-trip,
    /// many prices. Preferred over calling getLivePrice per asset.
    function getLivePrices(bytes32[] calldata feedIds) external view returns (uint256[] memory) {
        return getOracleNumericValuesFromTxMsg(feedIds);
    }
}
