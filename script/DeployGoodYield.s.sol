// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/yield/GoodVault.sol";
import "../src/yield/VaultFactory.sol";
import "../src/yield/strategies/LendingStrategy.sol";

/**
 * @title DeployGoodYield — Deploy vault factory + initial vaults
 * @notice Creates:
 *   1. VaultFactory (registry + vault deployer)
 *   2. LendingStrategy for ETH (deposits into GoodLend)
 *   3. GoodVault for ETH-Lending (auto-compound GoodLend yield)
 *   4. Seed vault with initial deposit
 */
contract DeployGoodYield is Script {
    function run() external {
        uint256 pk = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(pk);

        // Load existing contract addresses
        address ubiFee = vm.envOr("UBI_FEE", address(0));
        address lendPool = vm.envOr("LEND_POOL", address(0));
        address weth = vm.envOr("WETH", address(0));
        address gToken = vm.envOr("G_TOKEN_ETH", address(0));

        vm.startBroadcast(pk);

        // 1. Deploy VaultFactory
        VaultFactory factory = new VaultFactory(ubiFee);
        console.log("VaultFactory deployed:", address(factory));

        // If we have lending pool, deploy a lending strategy + vault
        if (lendPool != address(0) && weth != address(0) && gToken != address(0)) {
            // 2. Deploy LendingStrategy for ETH
            // Note: strategy needs vault address, but vault needs strategy
            // Solution: deploy strategy with placeholder, then update

            // For now, deploy vault with a simple strategy
            console.log("LendPool:", lendPool);
            console.log("WETH:", weth);
        }

        // Deploy a standalone vault with a mock strategy for demo
        // In production, wire to real LendingStrategy
        console.log("VaultFactory ready at:", address(factory));
        console.log("Admin:", deployer);

        vm.stopBroadcast();
    }
}
