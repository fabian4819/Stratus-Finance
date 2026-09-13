// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title StratusRewardToken
/// @notice Reward token minted by StratusStaking on stake/unstake/claim —
/// see that contract's docs. Ownership is transferred to StratusStaking
/// immediately after deploy so only it can mint; the deployer keeps no
/// minting power once that handoff happens (see script/14-deploy-staking.ts).
contract StratusRewardToken is ERC20, Ownable {
    constructor() ERC20("Stratus Reward", "STRAT") {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
