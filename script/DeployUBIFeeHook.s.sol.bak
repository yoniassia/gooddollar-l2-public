// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/hooks/UBIFeeHook.sol";
import "../src/GoodDollarToken.sol";
import "../src/UBIFeeSplitter.sol";

contract DeployUBIFeeHook is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        GoodDollarToken token = new GoodDollarToken(deployer, deployer, 1_000_000_000e18);

        UBIFeeSplitter splitter = new UBIFeeSplitter(address(token), deployer, deployer);

        address poolManager = address(0x1); // placeholder for devnet
        UBIFeeHook hook = new UBIFeeHook(poolManager, address(splitter), 3333, deployer);

        token.transfer(address(hook), 10_000_000e18);

        vm.stopBroadcast();

        console.log("GoodDollarToken:", address(token));
        console.log("UBIFeeSplitter:", address(splitter));
        console.log("UBIFeeHook:", address(hook));
        console.log("Hook funded with 10M G$");
    }
}
