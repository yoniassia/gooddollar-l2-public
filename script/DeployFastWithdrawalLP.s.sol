// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/bridge/FastWithdrawalLP.sol";

/**
 * @title DeployFastWithdrawalLP
 * @notice Deploys the FastWithdrawalLP contract on GoodDollar L2 devnet.
 *
 * Usage:
 *   forge script script/DeployFastWithdrawalLP.s.sol:DeployFastWithdrawalLP \
 *     --rpc-url http://localhost:8545 --broadcast -vvv
 */
contract DeployFastWithdrawalLP is Script {
    function run() external {
        uint256 deployerKey = vm.envOr(
            "DEPLOYER_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerKey);

        // UBI pool — use existing UBIScheme or deployer as placeholder
        address ubiPool = vm.envOr("UBI_POOL", deployer);

        // Fee: 10 bps = 0.1%
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(10));

        vm.startBroadcast(deployerKey);

        FastWithdrawalLP fastLP = new FastWithdrawalLP(deployer, ubiPool, feeBps);

        vm.stopBroadcast();

        console.log("FastWithdrawalLP deployed at:", address(fastLP));
        console.log("  admin:", deployer);
        console.log("  ubiPool:", ubiPool);
        console.log("  feeBps:", feeBps);
    }
}
