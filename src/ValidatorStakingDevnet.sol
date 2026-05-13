// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ValidatorStaking.sol";

/**
 * @title ValidatorStakingDevnet
 * @notice ValidatorStaking with devnet-friendly minimum stake
 *
 * Changes from base ValidatorStaking:
 * - MIN_STAKE reduced from 1M GDT to 10K GDT for testing
 * - All other functionality identical
 *
 * This fixes GOO-547: Users with 90k GDT can stake successfully
 */
contract ValidatorStakingDevnet {
    IGoodDollarToken public immutable goodDollar;

    uint256 public constant MIN_STAKE = 10_000e18; // 10K G$ minimum (reduced from 1M)
    uint256 public constant UNBONDING_PERIOD = 7 days;
    uint256 public rewardRateBPS = 500; // 5% annual reward rate
    uint256 public slashBPS = 1000;     // 10% slash for misbehavior

    struct UnbondingRequest {
        uint256 amount;
        uint256 unbondAt; // timestamp when withdrawal is available
    }

    struct Validator {
        uint256 staked;
        uint256 rewardDebt;
        uint256 lastStakeTime;
        bool isActive;
        string name;
        string endpoint; // RPC endpoint
        UnbondingRequest unbonding;
    }

    mapping(address => Validator) public validators;
    address[] public validatorList;
    mapping(address => uint256) private _validatorListIndex; // 1-based; 0 = not in list
    uint256 public totalStaked;
    uint256 public activeCount;

    address public admin;

    event ValidatorStaked(address indexed validator, uint256 amount, string name);
    event UnstakeInitiated(address indexed validator, uint256 amount, uint256 unbondAt);
    event UnstakeCompleted(address indexed validator, uint256 amount);
    event ValidatorSlashed(address indexed validator, uint256 amount, string reason);
    event RewardsClaimed(address indexed validator, uint256 amount);

    error NotAdmin();
    error NotValidator();
    error BelowMinStake();
    error InsufficientStake();
    error UnbondingAlreadyPending();
    error UnbondingNotReady(uint256 readyAt, uint256 currentTime);
    error NoUnbondingRequest();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /**
     * @notice Initialize the ValidatorStakingDevnet contract.
     * @param _goodDollar Address of the GoodDollar token contract
     * @param _admin Address with administrative privileges
     */
    constructor(address _goodDollar, address _admin) {
        goodDollar = IGoodDollarToken(_goodDollar);
        admin = _admin;
    }

    // ============ Staking ============

    /**
     * @notice Stake G$ to become a validator.
     * @param amount Amount of G$ to stake (must be >= 10K GDT for devnet)
     * @param name Human-readable validator name
     * @param endpoint RPC endpoint for this validator
     */
    function stake(uint256 amount, string calldata name, string calldata endpoint) external {
        if (amount < MIN_STAKE) revert BelowMinStake();

        goodDollar.transferFrom(msg.sender, address(this), amount);

        Validator storage v = validators[msg.sender];
        if (!v.isActive) {
            // Push to validatorList only if not already tracked (first stake or after full exit)
            if (_validatorListIndex[msg.sender] == 0) {
                _validatorListIndex[msg.sender] = validatorList.length + 1; // 1-based
                validatorList.push(msg.sender);
            }
            v.isActive = true;
            v.name = name;
            v.endpoint = endpoint;
            v.lastStakeTime = block.timestamp;
            activeCount++;
        } else {
            // Existing active validator adding more stake: accrue pending rewards
            // before increasing staked amount to prevent retroactive reward inflation.
            uint256 accrued = pendingRewards(msg.sender);
            if (accrued > 0) {
                v.rewardDebt += accrued;
            }
            v.lastStakeTime = block.timestamp;
        }
        v.staked += amount;
        totalStaked += amount;

        emit ValidatorStaked(msg.sender, amount, name);
    }

    /**
     * @notice Initiate unstaking. Starts the 7-day unbonding clock.
     * @dev Only one pending unbonding request allowed at a time.
     *      Slashing can still apply to unbonding amounts during this period.
     * @param amount G$ amount to unstake
     */
    function initiateUnstake(uint256 amount) external {
        Validator storage v = validators[msg.sender];
        if (!v.isActive) revert NotValidator();
        if (v.staked < amount) revert InsufficientStake();
        if (v.unbonding.amount > 0) revert UnbondingAlreadyPending();

        v.staked -= amount;
        totalStaked -= amount;

        v.unbonding = UnbondingRequest({
            amount: amount,
            unbondAt: block.timestamp + UNBONDING_PERIOD
        });

        if (v.staked < MIN_STAKE) {
            v.isActive = false;
            activeCount--;
        }

        emit UnstakeInitiated(msg.sender, amount, block.timestamp + UNBONDING_PERIOD);
    }

    /**
     * @notice Complete unstaking after the 7-day period.
     */
    function completeUnstake() external {
        Validator storage v = validators[msg.sender];
        if (v.unbonding.amount == 0) revert NoUnbondingRequest();
        if (block.timestamp < v.unbonding.unbondAt) {
            revert UnbondingNotReady(v.unbonding.unbondAt, block.timestamp);
        }

        uint256 amount = v.unbonding.amount;
        delete v.unbonding;

        // Fully exited — remove from validatorList so it doesn't grow unboundedly
        if (v.staked == 0) {
            _removeFromValidatorList(msg.sender);
        }

        require(goodDollar.transfer(msg.sender, amount), "transfer failed");
        emit UnstakeCompleted(msg.sender, amount);
    }

    // ============ Slashing ============

    /**
     * @notice Slash a validator. Applies to both staked AND unbonding amounts.
     *         Slashed G$ goes to UBI pool.
     * @param validator Address of the validator to slash
     * @param reason Description of the slashing reason
     */
    function slash(address validator, string calldata reason) external onlyAdmin {
        Validator storage v = validators[validator];
        require(v.isActive || v.unbonding.amount > 0, "Not active or unbonding");

        uint256 totalExposure = v.staked + v.unbonding.amount;
        uint256 slashAmount = (totalExposure * slashBPS) / 10000;

        // Slash staked first, then unbonding
        if (slashAmount <= v.staked) {
            v.staked -= slashAmount;
            totalStaked -= slashAmount;
        } else {
            uint256 fromStaked = v.staked;
            uint256 fromUnbonding = slashAmount - fromStaked;

            totalStaked -= fromStaked;
            v.staked = 0;

            if (fromUnbonding > v.unbonding.amount) {
                fromUnbonding = v.unbonding.amount;
            }
            v.unbonding.amount -= fromUnbonding;
        }

        if (v.staked < MIN_STAKE) {
            if (v.isActive) activeCount--;
            v.isActive = false;
        }

        // If fully slashed out of both pools, remove from list to cap its growth
        if (v.staked == 0 && v.unbonding.amount == 0) {
            _removeFromValidatorList(validator);
        }

        goodDollar.fundUBIPool(slashAmount);
        emit ValidatorSlashed(validator, slashAmount, reason);
    }

    // ============ Rewards ============

    /**
     * @notice Calculate pending rewards for a validator.
     * @param validator Address of the validator
     * @return uint256 Pending reward amount in G$
     */
    function pendingRewards(address validator) public view returns (uint256) {
        Validator storage v = validators[validator];
        if (!v.isActive || v.staked == 0) return 0;

        uint256 elapsed = block.timestamp - v.lastStakeTime;
        uint256 annualReward = (v.staked * rewardRateBPS) / 10000;
        return v.rewardDebt + (annualReward * elapsed) / 365 days;
    }

    /**
     * @notice Claim accumulated staking rewards.
     * @dev Rewards are paid from the contract's G$ balance. The balance must exceed
     *      totalStaked to ensure reward payments never draw from validators' principal.
     *      Rewards become claimable only when additional G$ (from protocol fees or
     *      inflation) has been deposited above the staked amount.
     */
    function claimRewards() external {
        Validator storage v = validators[msg.sender];
        require(v.isActive, "Not a validator");
        uint256 rewards = pendingRewards(msg.sender);
        require(rewards > 0, "No rewards");
        require(
            goodDollar.balanceOf(address(this)) >= totalStaked + rewards,
            "Insufficient reward reserve"
        );
        v.lastStakeTime = block.timestamp;
        v.rewardDebt = 0;
        require(goodDollar.transfer(msg.sender, rewards), "transfer failed");
        emit RewardsClaimed(msg.sender, rewards);
    }

    // ============ Internal ============

    /**
     * @dev O(1) swap-and-pop removal from validatorList.
     *      Clears the index mapping so the address can re-enter the list if they stake again.
     */
    function _removeFromValidatorList(address validator) private {
        uint256 idx = _validatorListIndex[validator]; // 1-based
        if (idx == 0) return;
        uint256 lastIdx = validatorList.length;
        if (idx != lastIdx) {
            address last = validatorList[lastIdx - 1];
            validatorList[idx - 1] = last;
            _validatorListIndex[last] = idx;
        }
        validatorList.pop();
        delete _validatorListIndex[validator];
    }

    // ============ View ============

    /**
     * @notice Get the number of currently active validators.
     * @return uint256 Number of active validators
     */
    function activeValidatorCount() external view returns (uint256) {
        return activeCount;
    }

    /**
     * @notice Get the total number of validators (active and inactive).
     * @return uint256 Total number of validators
     */
    function validatorCount() external view returns (uint256) {
        return validatorList.length;
    }

    /**
     * @notice Get unbonding request details for a validator.
     * @param validator Address of the validator
     * @return amount Amount being unbonded
     * @return unbondAt Timestamp when unbonding completes
     */
    function getUnbondingRequest(address validator)
        external
        view
        returns (uint256 amount, uint256 unbondAt)
    {
        return (validators[validator].unbonding.amount, validators[validator].unbonding.unbondAt);
    }

    /**
     * @notice Get the minimum stake requirement
     * @return uint256 Minimum stake amount in G$ (10K for devnet)
     */
    function minStake() external pure returns (uint256) {
        return MIN_STAKE;
    }

    /**
     * @notice Check if an amount meets the minimum stake requirement
     * @param amount Amount to check
     * @return bool True if amount >= MIN_STAKE
     */
    function meetsMinimumStake(uint256 amount) external pure returns (bool) {
        return amount >= MIN_STAKE;
    }
}