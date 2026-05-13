// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AgentRegistry.sol";

/**
 * @title Deploy Agent Registry & Seed Leaderboard
 * @notice Deploys AgentRegistry, registers 5 demo AI agents with trading activity
 */
contract DeployAgentRegistry is Script {
    function run() external {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // Deploy registry
        AgentRegistry registry = new AgentRegistry();
        console.log("AgentRegistry deployed at:", address(registry));

        // Authorize deployer as reporter for seeding
        // (deployer is already admin, which bypasses reporter check)

        // Register demo agents
        address agent1 = address(0x1001);
        address agent2 = address(0x1002);
        address agent3 = address(0x1003);
        address agent4 = address(0x1004);
        address agent5 = address(0x1005);

        registry.registerAgent(agent1, "AlphaTrader", "https://api.dicebear.com/7.x/bottts/svg?seed=alpha", "Momentum trading on perps with trend-following signals");
        registry.registerAgent(agent2, "YieldMaxi", "https://api.dicebear.com/7.x/bottts/svg?seed=yield", "Auto-compounding yield optimizer across lending and vaults");
        registry.registerAgent(agent3, "PredictOracleBot", "https://api.dicebear.com/7.x/bottts/svg?seed=predict", "Prediction market arbitrage using sentiment analysis");
        registry.registerAgent(agent4, "DeltaNeutral", "https://api.dicebear.com/7.x/bottts/svg?seed=delta", "Delta-neutral strategies: long spot + short perps");
        registry.registerAgent(agent5, "UBIMaximizer", "https://api.dicebear.com/7.x/bottts/svg?seed=ubi", "High-frequency swaps to maximize UBI fee generation");

        // Seed trading activity
        // Agent 1: Heavy perps trader
        registry.recordActivity(agent1, "perps", 500 ether, 1.5 ether);
        registry.recordActivity(agent1, "perps", 300 ether, 0.9 ether);
        registry.recordActivity(agent1, "swap", 50 ether, 0.15 ether);
        registry.recordPnL(agent1, 12 ether, true);

        // Agent 2: Yield + lending focused
        registry.recordActivity(agent2, "lend", 200 ether, 0.6 ether);
        registry.recordActivity(agent2, "yield", 150 ether, 0.45 ether);
        registry.recordActivity(agent2, "swap", 80 ether, 0.24 ether);
        registry.recordPnL(agent2, 8.5 ether, true);

        // Agent 3: Prediction markets
        registry.recordActivity(agent3, "predict", 100 ether, 0.3 ether);
        registry.recordActivity(agent3, "predict", 75 ether, 0.225 ether);
        registry.recordActivity(agent3, "swap", 30 ether, 0.09 ether);
        registry.recordPnL(agent3, 5.2 ether, true);

        // Agent 4: Delta-neutral (balanced)
        registry.recordActivity(agent4, "perps", 400 ether, 1.2 ether);
        registry.recordActivity(agent4, "swap", 400 ether, 1.2 ether);
        registry.recordActivity(agent4, "lend", 100 ether, 0.3 ether);
        registry.recordPnL(agent4, 0.3 ether, false); // slight loss

        // Agent 5: UBI maximizer — lots of small swaps
        for (uint256 i = 0; i < 10; i++) {
            registry.recordActivity(agent5, "swap", 20 ether, 0.06 ether);
        }
        registry.recordActivity(agent5, "predict", 50 ether, 0.15 ether);
        registry.recordPnL(agent5, 1.8 ether, true);

        vm.stopBroadcast();

        // Summary
        (uint256 totalAgents, uint256 totalTrades, uint256 totalVol, uint256 totalUBI) = registry.getDashboardStats();
        console.log("=== Agent Registry Seeded ===");
        console.log("Total agents:", totalAgents);
        console.log("Total trades:", totalTrades);
        console.log("Total volume (wei):", totalVol);
        console.log("Total UBI generated (wei):", totalUBI);
    }
}
