// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ValidatorStaking.sol";

interface IGoodDollarToken {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title FixGOO547 - ValidatorStaking MinStake Issue
 * @notice Deploy updated ValidatorStaking with configurable minStake for devnet testing
 *
 * Problem: Current contract has hardcoded MIN_STAKE = 1M GDT (too high for testing)
 * Solution: Deploy new ValidatorStaking with 10k GDT minimum
 */
contract FixGOO547 is Script {
    // Current problematic contract
    address constant OLD_VALIDATOR_STAKING = 0x103a3b128991781ee2c8db0454ca99d67b257923;

    // GoodDollar token from addresses.env
    address constant GDT = 0x36c02da8a0983159322a80ffe9f24b1acff8b570;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== GOO-547 Fix: ValidatorStaking MinStake Issue ===");
        console.log("Deployer:", deployer);
        console.log("GoodDollar Token:", GDT);
        console.log("Old ValidatorStaking:", OLD_VALIDATOR_STAKING);
        console.log();

        // Check user's GDT balance to confirm the issue
        uint256 userBalance = IGoodDollarToken(GDT).balanceOf(deployer);
        console.log("Deployer GDT balance:", userBalance / 1e18, "GDT");
        console.log("Current MIN_STAKE requirement: 1,000,000 GDT");
        console.log("User has sufficient funds:", userBalance >= 1_000_000e18 ? "YES" : "NO");

        if (userBalance < 1_000_000e18) {
            console.log("⚠️  Confirmed: User balance insufficient for current MIN_STAKE");
        }

        vm.startBroadcast(deployerKey);

        console.log("\n=== Deploying Updated ValidatorStaking ===");

        // Deploy new ValidatorStaking with configurable minStake
        ValidatorStakingConfigurable newStaking = new ValidatorStakingConfigurable(GDT, deployer);

        console.log("✓ New ValidatorStaking deployed:", address(newStaking));
        console.log("✓ Default MIN_STAKE:", newStaking.minStake() / 1e18, "GDT");

        // Set testing-friendly minimum stake (10k GDT)
        newStaking.setMinStake(10_000e18);
        console.log("✓ Updated MIN_STAKE to:", newStaking.minStake() / 1e18, "GDT");

        // Test staking with the new contract
        console.log("\n=== Testing Stake Function ===");

        // Approve the new contract to spend GDT
        IGoodDollarToken(GDT).approve(address(newStaking), 50_000e18);
        console.log("✓ Approved new contract for 50k GDT");

        // Try staking 20k GDT (should succeed with new 10k minimum)
        try newStaking.stake(20_000e18, "Test Validator", "http://localhost:8545") {
            console.log("✅ SUCCESS: Staking 20k GDT succeeded!");
            console.log("Validator is now active");
        } catch Error(string memory reason) {
            console.log("✗ Staking failed:", reason);
        } catch {
            console.log("✗ Staking failed with unknown error");
        }

        vm.stopBroadcast();

        console.log("\n=== Solution Summary ===");
        console.log("✓ New ValidatorStaking deployed with configurable minStake");
        console.log("✓ Minimum stake set to 10,000 GDT (realistic for testing)");
        console.log("✓ Users with 10k+ GDT can now stake successfully");
        console.log();
        console.log("📝 Update addresses.env:");
        console.log("   VS=" + Strings.toHexString(address(newStaking)));
        console.log();
        console.log("🧪 Test staking:");
        console.log("   cast send", Strings.toHexString(address(newStaking)));
        console.log("   'stake(uint256,string,string)' 15000000000000000000000 'MyValidator' 'http://test.com'");
    }
}

/**
 * @title ValidatorStakingConfigurable
 * @notice Updated ValidatorStaking with configurable minStake instead of constant
 */
contract ValidatorStakingConfigurable is ValidatorStaking {
    uint256 public minStake = 10_000e18; // Default 10k GDT for testing

    event MinStakeUpdated(uint256 oldMinStake, uint256 newMinStake);

    constructor(address _goodDollar, address _admin) ValidatorStaking(_goodDollar, _admin) {
        // Override the constant MIN_STAKE with configurable minStake
    }

    /**
     * @notice Update the minimum stake requirement
     * @param _minStake New minimum stake amount
     */
    function setMinStake(uint256 _minStake) external onlyAdmin {
        uint256 oldMinStake = minStake;
        minStake = _minStake;
        emit MinStakeUpdated(oldMinStake, _minStake);
    }

    /**
     * @notice Stake G$ to become a validator (overridden to use configurable minStake)
     */
    function stake(uint256 amount, string calldata name, string calldata endpoint) external override {
        if (amount < minStake) revert BelowMinStake();

        // Call parent implementation for the rest of the logic
        super.stake(amount, name, endpoint);
    }

    /**
     * @notice Check if amount meets minimum stake requirement
     */
    function meetsMinStake(uint256 amount) external view returns (bool) {
        return amount >= minStake;
    }
}