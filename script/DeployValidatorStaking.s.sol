// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ValidatorStaking.sol";

/**
 * @title DeployValidatorStaking
 * @notice Deploys ValidatorStaking for the GoodDollar L2 sequencer validator set.
 *
 *   Requires:
 *     PRIVATE_KEY         — deployer key
 *     GD_TOKEN            — GoodDollar token address (defaults to current devnet)
 *
 *   Usage (devnet):
 *     forge script script/DeployValidatorStaking.s.sol \
 *       --rpc-url http://localhost:8545 --broadcast --legacy
 */
contract DeployValidatorStaking is Script {

    address constant GD_TOKEN_DEFAULT = 0x36C02dA8a0983159322a80FFE9F24b1acfF8B570;

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(pk);
        address gdToken  = vm.envOr("GD_TOKEN", GD_TOKEN_DEFAULT);

        vm.startBroadcast(pk);

        ValidatorStaking staking = new ValidatorStaking(gdToken, deployer);
        console.log("ValidatorStaking deployed:", address(staking));
        console.log("  GoodDollar token:", gdToken);
        console.log("  Admin:           ", deployer);
        console.log("  MIN_STAKE:       ", staking.MIN_STAKE());
        console.log("  UNBONDING_PERIOD:", staking.UNBONDING_PERIOD());

        vm.stopBroadcast();

        console.log("\n=== ValidatorStaking Deployment Complete ===");
        console.log("Chain:            42069 (devnet)");
        console.log("ValidatorStaking:", address(staking));
    }
}
