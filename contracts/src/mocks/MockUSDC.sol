// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Plain mintable 6-decimal ERC20 standing in for USDC as the
/// borrowable debt asset. Not an RWA and deliberately not ATS-issued — the
/// debt asset is not the part of the protocol being demonstrated; see
/// PLAN.md Phase 1. Testnet/demo use only — the open `mint` must not exist
/// in anything resembling a production deployment.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Open mint for testnet faucet convenience.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
