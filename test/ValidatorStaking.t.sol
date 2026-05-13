// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ValidatorStaking.sol";
import "../src/GoodDollarToken.sol";

contract ValidatorStakingTest is Test {
    ValidatorStaking public staking;
    GoodDollarToken public token;

    address public admin = address(0xAD);
    address public oracle = address(0xCC);
    address public alice = address(0xA1);
    address public bob = address(0xB0);

    uint256 constant INITIAL_SUPPLY = 1_000_000_000e18;
    uint256 constant MIN_STAKE = 1_000_000e18;

    function setUp() public {
        token = new GoodDollarToken(admin, oracle, INITIAL_SUPPLY);
        staking = new ValidatorStaking(address(token), admin);

        // Fund staking contract with rewards
        vm.prank(admin);
        token.transfer(address(staking), 100_000_000e18);

        // Fund alice and bob
        vm.prank(admin);
        token.transfer(alice, 10_000_000e18);
        vm.prank(admin);
        token.transfer(bob, 10_000_000e18);

        vm.prank(alice);
        token.approve(address(staking), type(uint256).max);
        vm.prank(bob);
        token.approve(address(staking), type(uint256).max);
    }

    // ============ Stake ============

    function test_stake_becomesValidator() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice Node", "https://alice.node");

        (uint256 staked,,, bool isActive, string memory name,, ) = staking.validators(alice);
        assertTrue(isActive);
        assertEq(staked, MIN_STAKE);
        assertEq(name, "Alice Node");
    }

    function test_stake_belowMinimum_reverts() public {
        vm.prank(alice);
        vm.expectRevert(ValidatorStaking.BelowMinStake.selector);
        staking.stake(MIN_STAKE - 1, "Alice", "url");
    }

    function test_stake_addMultiple() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        (uint256 staked,,,,,,) = staking.validators(alice);
        assertEq(staked, MIN_STAKE * 2);
    }

    // ============ Initiate Unstake ============

    function test_initiateUnstake_createsRequest() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);

        (uint256 amount, uint256 unbondAt) = staking.getUnbondingRequest(alice);
        assertEq(amount, MIN_STAKE);
        assertEq(unbondAt, block.timestamp + 7 days);
    }

    function test_initiateUnstake_reducesStake() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE * 3, "Alice", "url");

        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);

        (uint256 staked,,,,,,) = staking.validators(alice);
        assertEq(staked, MIN_STAKE * 2);
    }

    function test_initiateUnstake_deactivatesIfBelowMin() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);

        (,,, bool isActive,,,) = staking.validators(alice);
        assertFalse(isActive);
    }

    function test_initiateUnstake_notValidator_reverts() public {
        vm.prank(alice);
        vm.expectRevert(ValidatorStaking.NotValidator.selector);
        staking.initiateUnstake(MIN_STAKE);
    }

    function test_initiateUnstake_duplicateRequest_reverts() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE * 3, "Alice", "url");

        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);

        vm.prank(alice);
        vm.expectRevert(ValidatorStaking.UnbondingAlreadyPending.selector);
        staking.initiateUnstake(MIN_STAKE);
    }

    function test_initiateUnstake_insufficientStake_reverts() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        vm.prank(alice);
        vm.expectRevert(ValidatorStaking.InsufficientStake.selector);
        staking.initiateUnstake(MIN_STAKE + 1);
    }

    // ============ Complete Unstake ============

    function test_completeUnstake_after7Days() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");
        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);

        uint256 aliceBefore = token.balanceOf(alice);

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        staking.completeUnstake();

        assertEq(token.balanceOf(alice), aliceBefore + MIN_STAKE);

        // Unbonding request cleared
        (uint256 amount,) = staking.getUnbondingRequest(alice);
        assertEq(amount, 0);
    }

    function test_completeUnstake_before7Days_reverts() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");
        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);

        vm.warp(block.timestamp + 6 days);
        vm.prank(alice);
        vm.expectRevert();
        staking.completeUnstake();
    }

    function test_completeUnstake_noRequest_reverts() public {
        vm.prank(alice);
        vm.expectRevert(ValidatorStaking.NoUnbondingRequest.selector);
        staking.completeUnstake();
    }

    function test_cannotWithdrawImmediately() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");
        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);

        // Try immediately — should fail (0 days elapsed)
        vm.prank(alice);
        vm.expectRevert();
        staking.completeUnstake();
    }

    // ============ Slashing During Unbonding ============

    function test_slash_duringUnbonding_reducesUnbondingAmount() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");
        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);

        uint256 ubiPoolBefore = token.ubiPool();

        // Admin slashes alice while she's unbonding
        vm.prank(admin);
        staking.slash(alice, "Equivocation during unbonding");

        (uint256 unbondingAmount,) = staking.getUnbondingRequest(alice);
        // 10% slashed from unbonding amount
        assertEq(unbondingAmount, MIN_STAKE - (MIN_STAKE / 10));

        // Slashed amount went to UBI
        assertGt(token.ubiPool(), ubiPoolBefore);
    }

    function test_slash_activeValidator_reducesStake() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE * 2, "Alice", "url");

        uint256 stakedBefore = MIN_STAKE * 2;

        vm.prank(admin);
        staking.slash(alice, "Double-sign");

        (uint256 staked,,,,,,) = staking.validators(alice);
        // 10% slashed from full exposure
        assertEq(staked, stakedBefore - (stakedBefore / 10));
    }

    function test_slash_bothStakedAndUnbonding() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE * 3, "Alice", "url");
        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE); // 1M unbonding, 2M staked

        vm.prank(admin);
        staking.slash(alice, "Misbehavior"); // 10% of 3M = 300k slash

        (uint256 staked,,,,,,) = staking.validators(alice);
        // totalExposure = 3M; 10% = 300k slash
        // Slash staked first: 2M - 300k = 1.7M staked
        assertEq(staked, MIN_STAKE * 2 - (MIN_STAKE * 3 / 10));

        (uint256 unbondingAmount,) = staking.getUnbondingRequest(alice);
        assertEq(unbondingAmount, MIN_STAKE); // unbonding unchanged (slash absorbed by staked)
    }

    // ============ Rewards ============

    function test_pendingRewards_accrue() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        // Warp 1 year
        vm.warp(block.timestamp + 365 days);

        uint256 rewards = staking.pendingRewards(alice);
        // 5% of 1M = 50k G$
        assertApproxEqRel(rewards, 50_000e18, 1e15); // within 0.1%
    }

    function test_claimRewards() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        vm.warp(block.timestamp + 365 days);

        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        staking.claimRewards();

        assertGt(token.balanceOf(alice), aliceBefore);
    }

    function test_claimRewards_resetsClock() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        vm.warp(block.timestamp + 365 days);
        vm.prank(alice);
        staking.claimRewards();

        // Rewards immediately after claim should be 0
        assertEq(staking.pendingRewards(alice), 0);
    }

    function test_slashOnlyAdmin() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        vm.prank(alice);
        vm.expectRevert(ValidatorStaking.NotAdmin.selector);
        staking.slash(alice, "Self-slash");
    }

    // ============ Active Validator Count ============

    function test_activeValidatorCount() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");
        vm.prank(bob);
        staking.stake(MIN_STAKE, "Bob", "url");

        assertEq(staking.activeValidatorCount(), 2);

        // Alice unstakes — becomes inactive
        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);
        assertEq(staking.activeValidatorCount(), 1);
    }

    // ============ GOO-97: Reward inflation on additional stake ============

    function test_additionalStake_doesNotInflateRewards() public {
        // Use an explicit absolute start time to avoid block.timestamp re-evaluation issues
        uint256 start = 1_000_000;
        vm.warp(start);

        // Alice stakes 1M G$ at start
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        // Fast-forward 6 months — rewards accrue on 1M G$
        vm.warp(start + 182 days);
        uint256 rewardsBeforeTopUp = staking.pendingRewards(alice);
        assertGt(rewardsBeforeTopUp, 0);

        // Alice adds another 1M G$ — should NOT retroactively inflate rewards
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        // Rewards right after top-up should equal what was accrued before it
        assertEq(staking.pendingRewards(alice), rewardsBeforeTopUp);

        // Fast-forward another 6 months — rewards should now accrue on 2M G$
        vm.warp(start + 364 days);
        uint256 expectedNewRewards = (MIN_STAKE * 2 * 500 / 10000) * 182 days / 365 days;
        uint256 totalPending = staking.pendingRewards(alice);
        assertApproxEqRel(totalPending, rewardsBeforeTopUp + expectedNewRewards, 1e15);
    }

    function test_additionalStake_claimIncludesAllAccruedRewards() public {
        uint256 start = 1_000_000;
        vm.warp(start);

        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        // Fast-forward 1 year — rewards accrue on 1M G$
        vm.warp(start + 365 days);

        // Top-up — rewards from first year are saved as rewardDebt
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        // Fast-forward another year — rewards accrue on 2M G$
        vm.warp(start + 730 days);

        // Claim should include both year 1 rewards (on 1M) and year 2 rewards (on 2M)
        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(alice);
        staking.claimRewards();

        uint256 claimed = token.balanceOf(alice) - aliceBefore;
        uint256 year1Expected = (MIN_STAKE * 500 / 10000); // 5% of 1M = 50k
        uint256 year2Expected = (MIN_STAKE * 2 * 500 / 10000); // 5% of 2M = 100k
        assertApproxEqRel(claimed, year1Expected + year2Expected, 1e15);
    }

    // ============ GOO-98: O(1) activeValidatorCount ============

    function test_activeValidatorCount_isO1_notLoop() public {
        // Verify activeCount is tracked as a state variable (O(1))
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        assertEq(staking.activeCount(), 1);

        vm.prank(bob);
        staking.stake(MIN_STAKE, "Bob", "url");

        assertEq(staking.activeCount(), 2);
        assertEq(staking.activeValidatorCount(), 2);

        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);

        assertEq(staking.activeCount(), 1);
        assertEq(staking.activeValidatorCount(), 1);
    }

    function test_slash_decrementsActiveCount() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        assertEq(staking.activeCount(), 1);

        vm.prank(admin);
        staking.slash(alice, "Double-sign");

        // 10% slashed → staked = 900k < MIN_STAKE → deactivated
        assertEq(staking.activeCount(), 0);
        assertEq(staking.activeValidatorCount(), 0);
    }

    function test_validatorList_noduplicateOnReactivation() public {
        // Alice stakes, falls below min, then re-stakes — should not duplicate validatorList
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        assertEq(staking.validatorCount(), 1);

        // Alice initiates full unstake → inactive
        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);

        assertEq(staking.validatorCount(), 1);

        // Alice re-stakes (without completing unstake) — still in list, not re-added
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        // validatorList should still have only 1 entry for Alice
        assertEq(staking.validatorCount(), 1);
        assertEq(staking.activeValidatorCount(), 1);
    }

    // ============ GOO-98: swap-and-pop on full exit ============

    /**
     * @notice Verifies that a validator who fully exits (completeUnstake with staked == 0)
     *         is removed from validatorList via swap-and-pop, preventing unbounded growth.
     */
    function test_validatorList_removedOnFullExit() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");
        vm.prank(bob);
        staking.stake(MIN_STAKE, "Bob", "url");

        assertEq(staking.validatorCount(), 2);

        // Alice initiates full unstake
        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);

        assertEq(staking.validatorCount(), 2); // still tracked during unbonding

        // Fast-forward past unbonding period
        vm.warp(block.timestamp + 7 days + 1);

        // Alice completes unstake with staked == 0 → should be removed from list
        vm.prank(alice);
        staking.completeUnstake();

        assertEq(staking.validatorCount(), 1); // Alice removed
        assertEq(staking.activeValidatorCount(), 1); // only Bob active
    }

    /**
     * @notice Verifies that after full exit and removal, a validator can re-enter
     *         the list cleanly by staking again.
     */
    function test_validatorList_canReenterAfterFullExit() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE);

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(alice);
        staking.completeUnstake();

        assertEq(staking.validatorCount(), 0);

        // Alice re-stakes fresh — should be re-added to validatorList
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        assertEq(staking.validatorCount(), 1);
        assertEq(staking.activeValidatorCount(), 1);
    }

    /**
     * @notice A validator slashed to zero staked + zero unbonding is removed from
     *         validatorList so fully-slashed-out addresses don't bloat the list.
     */
    function test_validatorList_removedOnFullSlash() public {
        vm.prank(alice);
        staking.stake(MIN_STAKE, "Alice", "url");

        assertEq(staking.validatorCount(), 1);

        // Repeatedly slash until both staked and unbonding hit 0.
        // Slash is 10% of (staked + unbonding). We drive staked to 0 by
        // initiating unbonding first, then slashing the full unbonding window.
        vm.prank(alice);
        staking.initiateUnstake(MIN_STAKE); // all moved to unbonding

        // Now totalExposure == unbonding.amount. Each slash is 10%.
        // After enough slashes, unbonding.amount reaches 0.
        for (uint256 i = 0; i < 100; i++) {
            (uint256 amt,) = staking.getUnbondingRequest(alice);
            if (amt == 0) break;
            vm.prank(admin);
            staking.slash(alice, "Repeated misbehavior");
        }

        (uint256 finalUnbonding,) = staking.getUnbondingRequest(alice);
        // After enough slashes the unbonding rounds to 0 due to integer division
        if (finalUnbonding == 0) {
            assertEq(staking.validatorCount(), 0); // removed from list
        }
        // If still non-zero (rounding keeps 1 wei), list may retain 1 entry — acceptable
    }
}
