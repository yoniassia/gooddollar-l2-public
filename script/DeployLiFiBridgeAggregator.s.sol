// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/swap/LiFiBridgeAggregator.sol";

contract DeployLiFiBridgeAggregator is Script {
    function run() external {
        uint256 deployerKey = vm.envOr("DEPLOYER_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        // Real UBIFeeSplitter from op-stack/addresses.json (GOO-160: was wrong MockUBIFeeSplitter)
        address ubiFeeSplitter = vm.envOr("UBI_FEE_SPLITTER",
            address(0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512));

        // Token addresses (devnet defaults)
        address gdollar = vm.envOr("GDOLLAR_ADDRESS", address(0x5FbDB2315678afecb367f032d93F642f64180aa3));
        // Real MockWETH from GoodLend deployment (GOO-160: was UBIFeeSplitter address)
        address weth    = vm.envOr("WETH_ADDRESS", address(0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1));
        address usdc    = vm.envOr("USDC_ADDRESS", address(0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0));
        address wbtc    = vm.envOr("WBTC_ADDRESS", address(0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9));

        vm.startBroadcast(deployerKey);

        LiFiBridgeAggregator agg = new LiFiBridgeAggregator(deployer, ubiFeeSplitter);
        console.log("LiFiBridgeAggregator deployed at:", address(agg));

        // Whitelist tokens
        address[] memory tokens = new address[](4);
        tokens[0] = gdollar;
        tokens[1] = weth;
        tokens[2] = usdc;
        tokens[3] = wbtc;
        agg.batchWhitelistTokens(tokens);
        console.log("Whitelisted 4 tokens: G$, WETH, USDC, WBTC");

        vm.stopBroadcast();
    }
}
