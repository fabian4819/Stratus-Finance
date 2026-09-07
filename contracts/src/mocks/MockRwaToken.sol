// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockRwaToken
/// @notice 18-decimal mintable ERC20 standing in for an ATS-issued
/// tokenized asset (e.g. GOLD-x, STOCK-x) in local unit/integration tests.
/// Testnet/demo deployments use the real ATS SDK output instead — see
/// `tokenization/` — never this mock. Kept here purely so `StratusVault`
/// and `StratusBasketToken` tests don't depend on ATS or network access.
contract MockRwaToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
