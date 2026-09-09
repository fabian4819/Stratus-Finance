// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockCrypto
/// @notice Plain mintable 18-decimal ERC20 standing in for a real crypto
/// asset (BTC, ETH, etc.) as a borrowable pool reserve — see
/// docs/phase-5-crypto-borrow.md. Same rationale as MockUSDC: these are
/// not RWA tokens and deliberately not ATS-issued; the point is giving
/// borrowers a choice of *which* crypto to borrow against their
/// tokenized-stock/gold collateral, priced by real RedStone feeds, not
/// simulating the assets themselves. Testnet/demo use only — the open
/// `mint` must not exist in anything resembling a production deployment.
contract MockCrypto is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    /// @notice Open mint for testnet faucet convenience / liquidity seeding.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
