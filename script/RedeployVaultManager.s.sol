// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/stable/VaultManager.sol";

/**
 * @title RedeployVaultManager
 * @notice Separate script for VaultManager to avoid interface collisions
 *         with CollateralVault (both define IUBIFeeSplitter).
 */
contract RedeployVaultManager is Script {
    address constant ADMIN           = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address constant UBI_FEE_SPLITTER= 0xBA6BfBa894B5cAF04c3462A5C8556fFBa4de6782;
    address constant GUSD_TOKEN      = 0x6B99600daD0a1998337357696827381D122825F3;
    address constant COLLATERAL_REG  = 0xca9507C5F707103e86B45DF4b35C37FE2700BB5B;
    address constant STABLE_ORACLE   = 0xB719422a0A484025c1A22a8dEEaFC67E81F43CfD;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        VaultManager vm2 = new VaultManager(
            GUSD_TOKEN,
            COLLATERAL_REG,
            STABLE_ORACLE,
            UBI_FEE_SPLITTER,
            ADMIN,  // dAppRecipient
            ADMIN   // admin
        );
        console.log("VaultManager:", address(vm2));

        vm.stopBroadcast();
    }
}
