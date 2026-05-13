// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IValidatorStaking {
    function minStake() external view returns (uint256);
    function setMinStake(uint256 _minStake) external;
    function admin() external view returns (address);
}

/**
 * @title FixValidatorStakingMinStake
 * @notice Fix GOO-560: Lower MIN_STAKE for devnet testing
 *
 *         Current: 1,000,000 GDT minimum (too high for testing)
 *         Fix: Set to 10,000 GDT for realistic testing
 *
 *         Note: This script assumes the ValidatorStaking contract
 *         has been updated to make minStake configurable.
 */
contract FixValidatorStakingMinStake is Script {
    // From GOO-560 issue
    address constant VALIDATOR_STAKING = 0x103a3b128991781ee2c8db0454ca99d67b257923;

    // Testing-friendly minimum stake: 10k GDT instead of 1M
    uint256 constant TEST_MIN_STAKE = 10_000e18;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("=== GOO-560 Fix: ValidatorStaking MinStake ===");
        console.log("ValidatorStaking:", VALIDATOR_STAKING);
        console.log("Deployer:", deployer);

        // Check current state
        try IValidatorStaking(VALIDATOR_STAKING).minStake() returns (uint256 currentMinStake) {
            console.log("Current minStake:", currentMinStake);
            console.log("Current minStake (formatted):", currentMinStake / 1e18, "GDT");
        } catch {
            console.log("ERROR: Could not read current minStake - contract may not be deployed or updated");
            console.log("This script requires ValidatorStaking to have configurable minStake");
            return;
        }

        // Check admin
        try IValidatorStaking(VALIDATOR_STAKING).admin() returns (address admin) {
            console.log("Contract admin:", admin);
            if (admin != deployer) {
                console.log("WARNING: Deployer is not admin - transaction may fail");
                console.log("Admin required to call setMinStake()");
            }
        } catch {
            console.log("Could not read admin address");
        }

        vm.startBroadcast(deployerKey);

        // Update minStake for testing
        try IValidatorStaking(VALIDATOR_STAKING).setMinStake(TEST_MIN_STAKE) {
            console.log("✓ MinStake updated successfully");
            console.log("New minStake:", TEST_MIN_STAKE / 1e18, "GDT");
        } catch Error(string memory reason) {
            console.log("✗ Failed to update minStake:", reason);
        } catch {
            console.log("✗ Failed to update minStake: unknown error");
            console.log("Possible causes:");
            console.log("1. Deployer is not admin");
            console.log("2. ValidatorStaking contract not updated with configurable minStake");
            console.log("3. Contract at address is wrong or not deployed");
        }

        vm.stopBroadcast();

        // Verify the fix
        console.log("\n=== Verification ===");
        try IValidatorStaking(VALIDATOR_STAKING).minStake() returns (uint256 newMinStake) {
            console.log("Final minStake:", newMinStake / 1e18, "GDT");

            if (newMinStake == TEST_MIN_STAKE) {
                console.log("✓ SUCCESS: MinStake correctly set to", newMinStake / 1e18, "GDT");
                console.log("Validators can now stake with reasonable amounts for testing");
            } else {
                console.log("✗ FAILED: MinStake not updated (still", newMinStake / 1e18, "GDT)");
            }
        } catch {
            console.log("Could not verify new minStake value");
        }

        console.log("\n=== Next Steps ===");
        console.log("1. Test staking with amounts >= 10k GDT");
        console.log("2. Verify BelowMinStake error for amounts < 10k GDT");
        console.log("3. If still failing, check ValidatorStaking contract implementation");
    }
}

/**
 * @title DiagnoseValidatorStaking
 * @notice Diagnostic script to check ValidatorStaking state
 */
contract DiagnoseValidatorStaking is Script {
    address constant VALIDATOR_STAKING = 0x103a3b128991781ee2c8db0454ca99d67b257923;

    function run() external view {
        console.log("=== ValidatorStaking Diagnosis ===");
        console.log("Contract:", VALIDATOR_STAKING);

        // Check if contract exists
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(VALIDATOR_STAKING)
        }
        console.log("Code size:", codeSize, "bytes");

        if (codeSize == 0) {
            console.log("ERROR: No code at ValidatorStaking address");
            console.log("Contract may not be deployed or address is wrong");
            return;
        }

        // Try to read contract state
        try IValidatorStaking(VALIDATOR_STAKING).minStake() returns (uint256 minStake) {
            console.log("MinStake:", minStake);
            console.log("MinStake (formatted):", minStake / 1e18, "GDT");

            if (minStake >= 1_000_000e18) {
                console.log("⚠️  MinStake is very high for testing");
            } else {
                console.log("✓ MinStake appears reasonable for testing");
            }
        } catch {
            console.log("ERROR: Cannot read minStake");
            console.log("Contract may not have minStake() function");
            console.log("Check if ValidatorStaking uses constant MIN_STAKE instead");
        }

        try IValidatorStaking(VALIDATOR_STAKING).admin() returns (address admin) {
            console.log("Admin:", admin);
        } catch {
            console.log("Could not read admin (function may not exist)");
        }

        console.log("\nIf minStake() fails, the contract likely uses:");
        console.log("uint256 public constant MIN_STAKE = 1_000_000e18;");
        console.log("This needs to be updated to a configurable variable.");
    }
}