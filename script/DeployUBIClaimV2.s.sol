// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/UBIClaimV2.sol";
import "../src/GoodDollarToken.sol";

/**
 * @notice Deploy UBIClaimV2 and wire it to GoodDollarToken + UBIFeeSplitter.
 *
 * Steps:
 *   1. Deploy UBIClaimV2 with GoodDollarToken, UBIFeeSplitter, and deployer as admin.
 *   2. Grant UBIClaimV2 the minter role on GoodDollarToken (setMinter).
 *   3. Set deployer as initial trusted relayer so gas-free claims can begin.
 *
 * Usage (devnet):
 *   PRIVATE_KEY=0x... GOOD_DOLLAR_TOKEN=0x... UBI_FEE_SPLITTER=0x... \
 *   forge script script/DeployUBIClaimV2.s.sol \
 *     --rpc-url $RPC --broadcast --legacy
 *
 * GOO-234: UBIClaimV2 was present in src/ but had no deployment script and
 * GoodDollarToken had not granted it MINTER_ROLE — this script fixes both gaps.
 */
contract DeployUBIClaimV2 is Script {
    function run() external {
        uint256 key = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(key);
        address gdToken     = vm.envOr("GOOD_DOLLAR_TOKEN", address(0));
        address feeSplitter = vm.envOr("UBI_FEE_SPLITTER",  address(0));
        require(gdToken     != address(0), "Set GOOD_DOLLAR_TOKEN env var");
        require(feeSplitter != address(0), "Set UBI_FEE_SPLITTER env var");

        vm.startBroadcast(key);

        // 1. Deploy UBIClaimV2
        UBIClaimV2 ubiClaim = new UBIClaimV2(
            gdToken,
            feeSplitter,
            deployer
        );
        console.log("UBIClaimV2 deployed:", address(ubiClaim));

        // 2. Grant MINTER_ROLE on GoodDollarToken
        GoodDollarToken(gdToken).setMinter(address(ubiClaim), true);
        console.log("Minter role granted to UBIClaimV2");

        // 3. Set deployer as initial trusted relayer
        ubiClaim.setRelayer(deployer, true);
        console.log("Deployer set as trusted relayer:", deployer);

        vm.stopBroadcast();

        console.log("--- UBIClaimV2 deployment complete ---");
        console.log("Address:", address(ubiClaim));
        console.log("GoodDollarToken:", gdToken);
        console.log("UBIFeeSplitter:", feeSplitter);
        console.log("Admin/Relayer:", deployer);
    }
}
