// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ILendingPool} from "./interfaces/ILendingPool.sol";
import {IPriceOracleGetter} from "./interfaces/IPriceOracleGetter.sol";
import {IProtocolDataProvider} from "./interfaces/IProtocolDataProvider.sol";

/// @title StratusRiskView
/// @notice Read-only aggregation over the pool's REAL (portfolio-level)
/// health factor, decorated with a per-component breakdown for the UI.
///
/// @dev IMPORTANT — this is a UX layer, not a new liquidation rule. Aave
/// v2's actual health factor (`pool.getUserAccountData`) is
/// portfolio-level: it determines whether ANY liquidation can happen at
/// all, and `pool.liquidationCall` is what actually enforces that only the
/// targeted collateral asset is seized (see `StratusVault` docs and
/// PLAN.md §1.2). The "component health factor" computed here is a
/// heuristic: it slices the user's total debt proportionally to each
/// component's share of collateral value, then asks whether that
/// component's own threshold-weighted value would cover its slice. It
/// answers "which leg is closest to being the one that gets liquidated,"
/// not "is this position safe" — that question is answered by
/// `combinedHealthFactor` alone. Always surface both numbers together;
/// never show only the per-component figure in isolation.
contract StratusRiskView {
    uint256 internal constant BPS_DENOMINATOR = 10_000;
    uint256 internal constant HF_PRECISION = 1e18;

    ILendingPool public immutable pool;
    IPriceOracleGetter public immutable oracle;
    IProtocolDataProvider public immutable dataProvider;

    struct ComponentRisk {
        address asset;
        uint256 aTokenBalance; // native decimals
        uint256 collateralValueUsd; // 18 decimals
        uint256 liquidationThresholdBps;
        uint256 debtShareUsd; // pro-rata slice of total debt, 18 decimals
        uint256 componentHealthFactor; // 18 decimals; type(uint256).max if no debt share
    }

    struct UserRisk {
        ComponentRisk[2] components;
        uint256 totalCollateralUsd;
        uint256 totalDebtUsd;
        uint256 combinedHealthFactor; // straight from pool.getUserAccountData — the real, enforced HF
    }

    constructor(address pool_, address oracle_, address dataProvider_) {
        require(pool_ != address(0) && oracle_ != address(0) && dataProvider_ != address(0), "zero address");
        pool = ILendingPool(pool_);
        oracle = IPriceOracleGetter(oracle_);
        dataProvider = IProtocolDataProvider(dataProvider_);
    }

    function getUserRisk(
        address user,
        address componentA,
        address componentB
    ) external view returns (UserRisk memory risk) {
        (, uint256 totalDebtUsd, , , , uint256 combinedHf) = pool.getUserAccountData(user);
        risk.totalDebtUsd = totalDebtUsd;
        risk.combinedHealthFactor = combinedHf;

        risk.components[0] = _componentRisk(componentA, user);
        risk.components[1] = _componentRisk(componentB, user);
        risk.totalCollateralUsd = risk.components[0].collateralValueUsd + risk.components[1].collateralValueUsd;

        for (uint256 i = 0; i < 2; i++) {
            ComponentRisk memory c = risk.components[i];
            if (risk.totalCollateralUsd == 0 || totalDebtUsd == 0) {
                c.debtShareUsd = 0;
                c.componentHealthFactor = type(uint256).max;
            } else {
                c.debtShareUsd = (totalDebtUsd * c.collateralValueUsd) / risk.totalCollateralUsd;
                if (c.debtShareUsd == 0) {
                    c.componentHealthFactor = type(uint256).max;
                } else {
                    uint256 thresholdWeighted = (c.collateralValueUsd * c.liquidationThresholdBps) /
                        BPS_DENOMINATOR;
                    c.componentHealthFactor = (thresholdWeighted * HF_PRECISION) / c.debtShareUsd;
                }
            }
            risk.components[i] = c;
        }
    }

    function _componentRisk(address asset, address user) internal view returns (ComponentRisk memory c) {
        c.asset = asset;

        (uint256 aTokenBalance, , , , , , , , ) = dataProvider.getUserReserveData(asset, user);
        c.aTokenBalance = aTokenBalance;

        (, , uint256 liquidationThreshold, , , , , , , ) = dataProvider.getReserveConfigurationData(asset);
        c.liquidationThresholdBps = liquidationThreshold;

        uint256 price = oracle.getAssetPrice(asset);
        uint8 decimals = IERC20Metadata(asset).decimals();
        c.collateralValueUsd = (aTokenBalance * price) / (10 ** decimals);
    }
}
