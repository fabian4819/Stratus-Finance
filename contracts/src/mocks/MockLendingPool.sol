// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MockLendingPool
/// @notice Minimal test double standing in for the real Aave v2 pool in
/// `StratusVault` unit tests. Implements only `deposit()` — the single
/// pool function the vault calls — and pulls the underlying via
/// `transferFrom` exactly like the real pool does, so the vault's
/// allowance/approval logic is exercised for real, not assumed.
///
/// The real pool's accounting (health factor, LTV-weighted borrow
/// capacity, liquidation) is deliberately NOT reimplemented here — those
/// properties are verified against the real, unmodified pool on testnet
/// (see `contracts/script/verify-gate2-deposit-withdraw.ts` and
/// `verify-gate3-*.ts`), not re-derived in a mock. This double exists
/// only to isolate `StratusVault`'s own decompose/recompose wrapper logic.
contract MockLendingPool {
    struct DepositCall {
        address asset;
        uint256 amount;
        address onBehalfOf;
        uint16 referralCode;
    }

    DepositCall[] public deposits;

    function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        deposits.push(DepositCall({asset: asset, amount: amount, onBehalfOf: onBehalfOf, referralCode: referralCode}));
    }

    function depositCount() external view returns (uint256) {
        return deposits.length;
    }
}
