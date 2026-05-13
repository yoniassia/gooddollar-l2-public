// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/oracle/SwapPriceOracle.sol";

/**
 * @title DeploySwapPriceOracle
 * @notice Deploys SwapPriceOracle and registers initial tokens with seed prices.
 *
 * Usage:
 *   forge script script/DeploySwapPriceOracle.s.sol --rpc-url http://localhost:8545 \
 *     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
 *     --broadcast
 */
contract DeploySwapPriceOracle is Script {
    function run() external {
        uint256 deployerKey = vm.envOr("DEPLOYER_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // Deploy oracle
        SwapPriceOracle oracle = new SwapPriceOracle(deployer);
        console.log("SwapPriceOracle deployed at:", address(oracle));

        // Read token addresses from env (with devnet defaults)
        address gdollar = vm.envOr("GDOLLAR_ADDRESS", address(0x5FbDB2315678afecb367f032d93F642f64180aa3));
        address weth    = vm.envOr("WETH_ADDRESS", address(0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512));
        address usdc    = vm.envOr("USDC_ADDRESS", address(0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0));
        address wbtc    = vm.envOr("WBTC_ADDRESS", address(0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9));

        // Register tokens
        oracle.registerToken(gdollar, "G$", 18, 300);
        oracle.registerToken(weth, "WETH", 18, 300);
        oracle.registerToken(usdc, "USDC", 6, 600);
        oracle.registerToken(wbtc, "WBTC", 8, 300);

        console.log("Registered 4 tokens: G$, WETH, USDC, WBTC");

        // Seed initial prices
        oracle.updatePrice(gdollar, 1_500_000);         // G$  = $0.015
        oracle.updatePrice(weth, 350_000_000_000);       // ETH = $3,500
        oracle.updatePrice(usdc, 100_000_000);           // USDC = $1.00
        oracle.updatePrice(wbtc, 8_500_000_000_000);     // BTC = $85,000

        console.log("Seeded initial prices");
        console.log("  G$:   $0.015");
        console.log("  WETH: $3,500");
        console.log("  USDC: $1.00");
        console.log("  WBTC: $85,000");

        vm.stopBroadcast();
    }
}
