// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/GoodDollarTokenSecure.sol";

contract GoodDollarTokenSecureTest is Test {
    GoodDollarTokenSecure token;

    address admin = address(0x1);
    address oracle1 = address(0x2);
    address oracle2 = address(0x3);
    address oracle3 = address(0x4);
    address emergencyPauser = address(0x5);
    address user = address(0x6);
    address attacker = address(0x7);

    uint256 constant INITIAL_SUPPLY = 1000000 ether;
    uint256 constant TIMELOCK_DELAY = 48 hours;

    function setUp() public {
        address[] memory initialOracles = new address[](2);
        initialOracles[0] = oracle1;
        initialOracles[1] = oracle2;

        token = new GoodDollarTokenSecure(
            admin,
            initialOracles,
            emergencyPauser,
            INITIAL_SUPPLY
        );
    }

    // ============ Oracle Multi-Sig Tests ============

    function test_constructor_requiresMinimumOracles() public {
        address[] memory singleOracle = new address[](1);
        singleOracle[0] = oracle1;

        vm.expectRevert("Need at least 2 oracles for security");
        new GoodDollarTokenSecure(admin, singleOracle, emergencyPauser, INITIAL_SUPPLY);
    }

    function test_multipleOraclesCanVerify() public {
        // Oracle 1 can verify
        vm.prank(oracle1);
        token.verifyHuman(user, true);
        assertTrue(token.isVerifiedHuman(user));

        // Oracle 2 can also verify different user
        address user2 = address(0x8);
        vm.prank(oracle2);
        token.verifyHuman(user2, true);
        assertTrue(token.isVerifiedHuman(user2));
    }

    function test_nonOracleCannotVerify() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(GoodDollarTokenSecure.UnauthorizedRole.selector, token.ORACLE_ROLE()));
        token.verifyHuman(user, true);
    }

    // ============ Emergency Pause Tests ============

    function test_emergencyPauseByEmergencyRole() public {
        vm.prank(emergencyPauser);
        token.setVerificationPaused(true);
        assertTrue(token.verificationPaused());
    }

    function test_emergencyPauseByAdmin() public {
        vm.prank(admin);
        token.setVerificationPaused(true);
        assertTrue(token.verificationPaused());
    }

    function test_unauthorizedCannotPause() public {
        vm.prank(attacker);
        vm.expectRevert("Need EMERGENCY_ROLE or ADMIN_ROLE");
        token.setVerificationPaused(true);
    }

    function test_verificationFailsWhenPaused() public {
        // Pause verification
        vm.prank(emergencyPauser);
        token.setVerificationPaused(true);

        // Oracle cannot verify when paused
        vm.prank(oracle1);
        vm.expectRevert(GoodDollarTokenSecure.VerificationPaused.selector);
        token.verifyHuman(user, true);
    }

    function test_batchVerificationFailsWhenPaused() public {
        vm.prank(admin);
        token.setVerificationPaused(true);

        address[] memory users = new address[](2);
        users[0] = user;
        users[1] = address(0x8);

        vm.prank(oracle1);
        vm.expectRevert(GoodDollarTokenSecure.VerificationPaused.selector);
        token.batchVerifyHumans(users);
    }

    // ============ Timelock Tests ============

    function test_scheduleOracleChange() public {
        vm.prank(admin);
        token.scheduleOracleChange(oracle3, true);

        // Check the change is scheduled
        (address oracle, bool add, uint256 executeAt, bool executed) = token.pendingOracleChanges(1);
        assertEq(oracle, oracle3);
        assertTrue(add);
        assertEq(executeAt, block.timestamp + TIMELOCK_DELAY);
        assertFalse(executed);
    }

    function test_cannotExecuteBeforeTimelock() public {
        vm.prank(admin);
        token.scheduleOracleChange(oracle3, true);

        // Try to execute immediately
        vm.expectRevert(abi.encodeWithSelector(
            GoodDollarTokenSecure.TimelockNotReady.selector,
            block.timestamp + TIMELOCK_DELAY
        ));
        token.executeOracleChange(1);
    }

    function test_executeOracleChangeAfterTimelock() public {
        // Schedule oracle addition
        vm.prank(admin);
        token.scheduleOracleChange(oracle3, true);

        // Fast forward time
        vm.warp(block.timestamp + TIMELOCK_DELAY);

        // Execute the change
        token.executeOracleChange(1);

        // Verify oracle3 now has oracle role
        assertTrue(token.hasRole(token.ORACLE_ROLE(), oracle3));
        assertEq(token.getRoleCount(token.ORACLE_ROLE()), 3);
    }

    function test_cancelOracleChange() public {
        vm.prank(admin);
        token.scheduleOracleChange(oracle3, true);

        vm.prank(admin);
        token.cancelOracleChange(1);

        // Check change is deleted
        (address oracle,,,) = token.pendingOracleChanges(1);
        assertEq(oracle, address(0));
    }

    function test_cannotRemoveLastOracle() public {
        // Schedule removal of oracle1
        vm.prank(admin);
        token.scheduleOracleChange(oracle1, false);

        // Execute after timelock
        vm.warp(block.timestamp + TIMELOCK_DELAY);
        token.executeOracleChange(1);

        // Now there's only 1 oracle left, cannot schedule removal
        vm.prank(admin);
        vm.expectRevert(GoodDollarTokenSecure.InsufficientOracles.selector);
        token.scheduleOracleChange(oracle2, false);
    }

    // ============ Role Management Tests ============

    function test_adminCanGrantAdminRole() public {
        vm.prank(admin);
        token.grantAdminRole(user);
        assertTrue(token.hasRole(token.ADMIN_ROLE(), user));
    }

    function test_adminCannotRevokeLastAdmin() public {
        vm.prank(admin);
        vm.expectRevert("Need at least 1 admin");
        token.revokeAdminRole(admin);
    }

    function test_adminCanGrantEmergencyRole() public {
        vm.prank(admin);
        token.grantEmergencyRole(user);
        assertTrue(token.hasRole(token.EMERGENCY_ROLE(), user));

        // New emergency role holder can pause
        vm.prank(user);
        token.setVerificationPaused(true);
        assertTrue(token.verificationPaused());
    }

    // ============ UBI Functionality Still Works ============

    function test_verifiedUserCanClaimUBI() public {
        // Verify user
        vm.prank(oracle1);
        token.verifyHuman(user, true);

        uint256 initialBalance = token.balanceOf(user);

        // Claim UBI
        vm.prank(user);
        token.claimUBI();

        assertEq(token.balanceOf(user), initialBalance + token.dailyUBIAmount());
        assertEq(token.lastClaimTime(user), block.timestamp);
    }

    function test_batchVerificationWorks() public {
        address[] memory users = new address[](3);
        users[0] = user;
        users[1] = address(0x8);
        users[2] = address(0x9);

        vm.prank(oracle1);
        token.batchVerifyHumans(users);

        assertTrue(token.isVerifiedHuman(user));
        assertTrue(token.isVerifiedHuman(address(0x8)));
        assertTrue(token.isVerifiedHuman(address(0x9)));
        assertEq(token.totalVerifiedHumans(), 3);
    }

    // ============ View Functions Tests ============

    function test_getRoleCount() public view {
        assertEq(token.getRoleCount(token.ORACLE_ROLE()), 2);
        assertEq(token.getRoleCount(token.ADMIN_ROLE()), 1);
        assertEq(token.getRoleCount(token.EMERGENCY_ROLE()), 1);
    }

    function test_isChangeReady() public {
        vm.prank(admin);
        token.scheduleOracleChange(oracle3, true);

        assertFalse(token.isChangeReady(1));

        vm.warp(block.timestamp + TIMELOCK_DELAY);
        assertTrue(token.isChangeReady(1));
    }

    // ============ Security Scenario Tests ============

    function test_compromisedOracleIsolation() public {
        // Oracle1 gets compromised and tries malicious verification
        vm.prank(oracle1);
        token.verifyHuman(attacker, true);

        // Admin immediately pauses verification
        vm.prank(admin);
        token.setVerificationPaused(true);

        // Schedule removal of compromised oracle
        vm.prank(admin);
        token.scheduleOracleChange(oracle1, false);

        // Compromised oracle can no longer do anything
        vm.prank(oracle1);
        vm.expectRevert(GoodDollarTokenSecure.VerificationPaused.selector);
        token.verifyHuman(address(0x999), true);

        // After timelock, remove the compromised oracle
        vm.warp(block.timestamp + TIMELOCK_DELAY);
        token.executeOracleChange(1);

        // Unpause verification
        vm.prank(admin);
        token.setVerificationPaused(false);

        // Oracle1 no longer has oracle role
        assertFalse(token.hasRole(token.ORACLE_ROLE(), oracle1));

        // Oracle2 still works
        vm.prank(oracle2);
        token.verifyHuman(user, true);
        assertTrue(token.isVerifiedHuman(user));
    }
}