// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {StratusRewardToken} from "./StratusRewardToken.sol";

/// @title StratusStaking
/// @notice Stake any of the borrowable crypto reserves (see
/// docs/phase-5-crypto-borrow.md) to earn StratusRewardToken — entirely
/// independent of the lending pool. Staking here is not lending-pool
/// collateral and vice versa; a token can be staked and separately held
/// as pool collateral at the same time, they don't interact.
///
/// Standard MasterChef-style multi-pool accumulator: each pool emits a
/// flat `rewardPerSecond`, split pro-rata across everyone staked in it
/// via an `accRewardPerShare` running total, updated on every
/// stake/unstake/claim. Rewards are minted on payout (this contract is
/// the sole owner of StratusRewardToken) rather than pulled from a
/// pre-funded pot — the simplest correct choice with no real emissions
/// budget to manage; disclosed here the same way MockCrypto.sol
/// discloses its own open `mint` as testnet-only, not a production
/// reward economy.
contract StratusStaking is Ownable {
    using SafeERC20 for IERC20;

    struct PoolInfo {
        IERC20 token;
        uint256 rewardPerSecond;
        uint256 totalStaked;
        uint256 accRewardPerShare; // scaled by ACC_PRECISION
        uint256 lastRewardTime;
    }

    struct UserInfo {
        uint256 amount;
        uint256 rewardDebt;
    }

    uint256 internal constant ACC_PRECISION = 1e18;

    StratusRewardToken public immutable rewardToken;
    PoolInfo[] public pools;
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;
    mapping(address => bool) public hasPool;

    event PoolAdded(uint256 indexed poolId, address indexed token, uint256 rewardPerSecond);
    event Staked(uint256 indexed poolId, address indexed user, uint256 amount);
    event Unstaked(uint256 indexed poolId, address indexed user, uint256 amount);
    event Claimed(uint256 indexed poolId, address indexed user, uint256 amount);

    constructor(address rewardToken_) {
        require(rewardToken_ != address(0), "zero address");
        rewardToken = StratusRewardToken(rewardToken_);
    }

    function poolLength() external view returns (uint256) {
        return pools.length;
    }

    function addPool(address token, uint256 rewardPerSecond) external onlyOwner {
        require(token != address(0), "zero address");
        require(!hasPool[token], "pool exists");
        pools.push(
            PoolInfo({
                token: IERC20(token),
                rewardPerSecond: rewardPerSecond,
                totalStaked: 0,
                accRewardPerShare: 0,
                lastRewardTime: block.timestamp
            })
        );
        emit PoolAdded(pools.length - 1, token, rewardPerSecond);
        hasPool[token] = true;
    }

    function _updatePool(uint256 poolId) internal {
        PoolInfo storage pool = pools[poolId];
        if (block.timestamp <= pool.lastRewardTime) return;
        if (pool.totalStaked == 0) {
            pool.lastRewardTime = block.timestamp;
            return;
        }
        uint256 elapsed = block.timestamp - pool.lastRewardTime;
        uint256 reward = elapsed * pool.rewardPerSecond;
        pool.accRewardPerShare += (reward * ACC_PRECISION) / pool.totalStaked;
        pool.lastRewardTime = block.timestamp;
    }

    /// @notice View-only projection of _updatePool, for the frontend to
    /// show live-accruing rewards without sending a transaction.
    function pendingReward(uint256 poolId, address user) external view returns (uint256) {
        PoolInfo storage pool = pools[poolId];
        UserInfo storage u = userInfo[poolId][user];
        uint256 accRewardPerShare = pool.accRewardPerShare;
        if (block.timestamp > pool.lastRewardTime && pool.totalStaked > 0) {
            uint256 elapsed = block.timestamp - pool.lastRewardTime;
            uint256 reward = elapsed * pool.rewardPerSecond;
            accRewardPerShare += (reward * ACC_PRECISION) / pool.totalStaked;
        }
        return (u.amount * accRewardPerShare) / ACC_PRECISION - u.rewardDebt;
    }

    function stake(uint256 poolId, uint256 amount) external {
        require(amount > 0, "zero amount");
        PoolInfo storage pool = pools[poolId];
        UserInfo storage u = userInfo[poolId][msg.sender];
        _updatePool(poolId);

        if (u.amount > 0) {
            uint256 pending = (u.amount * pool.accRewardPerShare) / ACC_PRECISION - u.rewardDebt;
            if (pending > 0) {
                rewardToken.mint(msg.sender, pending);
                emit Claimed(poolId, msg.sender, pending);
            }
        }

        pool.token.safeTransferFrom(msg.sender, address(this), amount);
        u.amount += amount;
        pool.totalStaked += amount;
        u.rewardDebt = (u.amount * pool.accRewardPerShare) / ACC_PRECISION;
        emit Staked(poolId, msg.sender, amount);
    }

    function unstake(uint256 poolId, uint256 amount) external {
        PoolInfo storage pool = pools[poolId];
        UserInfo storage u = userInfo[poolId][msg.sender];
        require(u.amount >= amount, "insufficient staked");
        _updatePool(poolId);

        uint256 pending = (u.amount * pool.accRewardPerShare) / ACC_PRECISION - u.rewardDebt;
        if (pending > 0) {
            rewardToken.mint(msg.sender, pending);
            emit Claimed(poolId, msg.sender, pending);
        }

        u.amount -= amount;
        pool.totalStaked -= amount;
        u.rewardDebt = (u.amount * pool.accRewardPerShare) / ACC_PRECISION;
        pool.token.safeTransfer(msg.sender, amount);
        emit Unstaked(poolId, msg.sender, amount);
    }

    function claim(uint256 poolId) external {
        PoolInfo storage pool = pools[poolId];
        UserInfo storage u = userInfo[poolId][msg.sender];
        _updatePool(poolId);

        uint256 pending = (u.amount * pool.accRewardPerShare) / ACC_PRECISION - u.rewardDebt;
        u.rewardDebt = (u.amount * pool.accRewardPerShare) / ACC_PRECISION;
        if (pending > 0) {
            rewardToken.mint(msg.sender, pending);
            emit Claimed(poolId, msg.sender, pending);
        }
    }
}
