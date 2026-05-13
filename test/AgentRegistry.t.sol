// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry registry;
    address admin = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address reporter = address(0xBEEF);
    address agentAlpha = address(0x1001);
    address agentBeta = address(0x1002);
    address agentGamma = address(0x1003);

    function setUp() public {
        registry = new AgentRegistry();
        registry.addReporter(reporter);
    }

    // ============ Registration ============

    function test_registerAgent() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "ipfs://avatar1", "Momentum perps");
        
        assertTrue(registry.isRegistered(agentAlpha));
        assertEq(registry.totalAgents(), 1);
        assertEq(registry.getAgentCount(), 1);
        assertEq(registry.getAgent(0), agentAlpha);

        (AgentRegistry.AgentProfile memory p, AgentRegistry.AgentStats memory s) = registry.getAgentInfo(agentAlpha);
        assertEq(p.name, "AlphaBot");
        assertEq(p.avatarURI, "ipfs://avatar1");
        assertEq(p.strategy, "Momentum perps");
        assertEq(p.owner, address(this));
        assertTrue(p.active);
        assertEq(s.totalTrades, 0);
        assertEq(s.totalVolume, 0);
    }

    function test_cannotRegisterTwice() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");
        vm.expectRevert("AgentRegistry: already registered");
        registry.registerAgent(agentAlpha, "AlphaBot2", "", "");
    }

    function test_requiresName() public {
        vm.expectRevert("AgentRegistry: name required");
        registry.registerAgent(agentAlpha, "", "", "");
    }

    // ============ Profile Updates ============

    function test_updateProfile() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");
        registry.updateProfile(agentAlpha, "AlphaBot V2", "ipfs://new", "New strategy");

        (AgentRegistry.AgentProfile memory p,) = registry.getAgentInfo(agentAlpha);
        assertEq(p.name, "AlphaBot V2");
        assertEq(p.avatarURI, "ipfs://new");
        assertEq(p.strategy, "New strategy");
    }

    function test_onlyOwnerCanUpdate() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: not owner");
        registry.updateProfile(agentAlpha, "Hacked", "", "");
    }

    function test_adminCanUpdate() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");
        // admin (address(this)) can update anyone
        registry.updateProfile(agentAlpha, "AdminUpdated", "", "");
        (AgentRegistry.AgentProfile memory p,) = registry.getAgentInfo(agentAlpha);
        assertEq(p.name, "AdminUpdated");
    }

    function test_deactivateAgent() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");
        registry.deactivateAgent(agentAlpha);
        (AgentRegistry.AgentProfile memory p,) = registry.getAgentInfo(agentAlpha);
        assertFalse(p.active);
    }

    // ============ Activity Recording ============

    function test_recordActivity() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");

        vm.prank(reporter);
        registry.recordActivity(agentAlpha, "swap", 10 ether, 0.03 ether);

        (, AgentRegistry.AgentStats memory s) = registry.getAgentInfo(agentAlpha);
        assertEq(s.totalTrades, 1);
        assertEq(s.totalVolume, 10 ether);
        assertEq(s.totalFeesGenerated, 0.03 ether);
        // 33.33% of 0.03 ether = 0.009999 ether
        assertEq(s.ubiContribution, (0.03 ether * 3333) / 10000);

        // Global stats
        assertEq(registry.totalTrades(), 1);
        assertEq(registry.totalVolume(), 10 ether);
        assertEq(registry.totalUBIGenerated(), (0.03 ether * 3333) / 10000);
    }

    function test_autoRegisterUnknownAgent() public {
        // Record activity for unregistered agent → auto-registers
        vm.prank(reporter);
        registry.recordActivity(agentBeta, "perps", 5 ether, 0.01 ether);

        assertTrue(registry.isRegistered(agentBeta));
        (AgentRegistry.AgentProfile memory p, AgentRegistry.AgentStats memory s) = registry.getAgentInfo(agentBeta);
        assertEq(p.name, "Anonymous Agent");
        assertEq(s.totalTrades, 1);
        assertEq(s.totalVolume, 5 ether);
    }

    function test_onlyReporterCanRecord() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: not reporter");
        registry.recordActivity(agentAlpha, "swap", 1 ether, 0.003 ether);
    }

    function test_adminCanRecordDirectly() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");
        // admin bypasses reporter check
        registry.recordActivity(agentAlpha, "swap", 1 ether, 0.003 ether);
        (, AgentRegistry.AgentStats memory s) = registry.getAgentInfo(agentAlpha);
        assertEq(s.totalTrades, 1);
    }

    function test_perProtocolBreakdown() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");

        vm.startPrank(reporter);
        registry.recordActivity(agentAlpha, "swap", 10 ether, 0.03 ether);
        registry.recordActivity(agentAlpha, "swap", 5 ether, 0.015 ether);
        registry.recordActivity(agentAlpha, "perps", 20 ether, 0.06 ether);
        vm.stopPrank();

        AgentRegistry.ProtocolActivity memory swapStats = registry.getAgentProtocolStats(agentAlpha, "swap");
        assertEq(swapStats.trades, 2);
        assertEq(swapStats.volume, 15 ether);
        assertEq(swapStats.fees, 0.045 ether);

        AgentRegistry.ProtocolActivity memory perpsStats = registry.getAgentProtocolStats(agentAlpha, "perps");
        assertEq(perpsStats.trades, 1);
        assertEq(perpsStats.volume, 20 ether);
    }

    function test_recordPnL() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");

        vm.prank(reporter);
        registry.recordPnL(agentAlpha, 2 ether, true);

        (, AgentRegistry.AgentStats memory s) = registry.getAgentInfo(agentAlpha);
        assertEq(s.totalPnL, 2 ether);
        assertTrue(s.pnlPositive);

        vm.prank(reporter);
        registry.recordPnL(agentAlpha, 0.5 ether, false);

        (, s) = registry.getAgentInfo(agentAlpha);
        assertEq(s.totalPnL, 0.5 ether);
        assertFalse(s.pnlPositive);
    }

    // ============ Leaderboard ============

    function test_getTopAgents() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");
        registry.registerAgent(agentBeta, "BetaBot", "", "");
        registry.registerAgent(agentGamma, "GammaBot", "", "");

        vm.startPrank(reporter);
        registry.recordActivity(agentAlpha, "swap", 10 ether, 0.03 ether);
        registry.recordActivity(agentBeta, "perps", 50 ether, 0.15 ether);
        registry.recordActivity(agentGamma, "predict", 30 ether, 0.09 ether);
        vm.stopPrank();

        (
            address[] memory addrs,
            string[] memory names,
            uint256[] memory ubi,
            uint256[] memory vol,
            uint256[] memory trades
        ) = registry.getTopAgents(3);

        // Beta should be #1 (highest fees → highest UBI)
        assertEq(addrs[0], agentBeta);
        assertEq(names[0], "BetaBot");
        // Gamma #2
        assertEq(addrs[1], agentGamma);
        // Alpha #3
        assertEq(addrs[2], agentAlpha);

        // Verify UBI amounts are descending
        assertTrue(ubi[0] > ubi[1]);
        assertTrue(ubi[1] > ubi[2]);
    }

    function test_topAgentsExcludesInactive() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");
        registry.registerAgent(agentBeta, "BetaBot", "", "");

        vm.startPrank(reporter);
        registry.recordActivity(agentAlpha, "swap", 10 ether, 0.03 ether);
        registry.recordActivity(agentBeta, "swap", 50 ether, 0.15 ether);
        vm.stopPrank();

        // Deactivate beta (highest UBI)
        registry.deactivateAgent(agentBeta);

        (address[] memory addrs,,,,) = registry.getTopAgents(2);
        // Alpha should be #1 now since Beta is inactive
        assertEq(addrs[0], agentAlpha);
    }

    function test_getDashboardStats() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");

        vm.startPrank(reporter);
        registry.recordActivity(agentAlpha, "swap", 10 ether, 0.03 ether);
        registry.recordActivity(agentAlpha, "perps", 20 ether, 0.06 ether);
        vm.stopPrank();

        (uint256 a, uint256 t, uint256 v, uint256 u) = registry.getDashboardStats();
        assertEq(a, 1);
        assertEq(t, 2);
        assertEq(v, 30 ether);
        assertEq(u, (0.09 ether * 3333) / 10000);
    }

    // ============ Admin ============

    function test_addRemoveReporter() public {
        address newReporter = address(0xCAFE);
        registry.addReporter(newReporter);
        assertTrue(registry.authorizedReporters(newReporter));

        registry.removeReporter(newReporter);
        assertFalse(registry.authorizedReporters(newReporter));
    }

    function test_cannotAddReporterTwice() public {
        vm.expectRevert("AgentRegistry: already reporter");
        registry.addReporter(reporter);
    }

    function test_onlyAdminCanAddReporter() public {
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: not admin");
        registry.addReporter(address(0xCAFE));
    }

    function test_setUBIBPS() public {
        registry.setUBIBPS(5000);
        assertEq(registry.ubiBPS(), 5000);
    }

    function test_ubiBPSCapped() public {
        vm.expectRevert("AgentRegistry: bps too high");
        registry.setUBIBPS(10001);
    }

    function test_transferAdmin_TwoStep() public {
        vm.expectEmit(true, true, false, false);
        emit AgentRegistry.AdminTransferInitiated(address(this), alice);
        registry.transferAdmin(alice);
        assertEq(registry.pendingAdmin(), alice);
        // Old admin still active until alice accepts
        registry.addReporter(address(0xABC));
        // Alice accepts
        vm.expectEmit(true, true, false, false);
        emit AgentRegistry.AdminTransferred(address(this), alice);
        vm.prank(alice);
        registry.acceptAdmin();
        assertEq(registry.admin(), alice);
        assertEq(registry.pendingAdmin(), address(0));
        // Old admin can no longer act
        vm.expectRevert("AgentRegistry: not admin");
        registry.addReporter(address(0xDEAD));
    }

    function test_transferAdmin_RejectsZero() public {
        vm.expectRevert("AgentRegistry: zero admin");
        registry.transferAdmin(address(0));
    }

    function test_acceptAdmin_OnlyPending_Reverts() public {
        registry.transferAdmin(alice);
        vm.expectRevert("AgentRegistry: not pending admin");
        vm.prank(bob);
        registry.acceptAdmin();
    }

    // ============ maxAgents Cap ============

    function test_registerAgent_revertsAtCap() public {
        registry.setMaxAgents(2);
        registry.registerAgent(agentAlpha, "A", "", "");
        registry.registerAgent(agentBeta, "B", "", "");
        vm.expectRevert("AgentRegistry: capacity reached");
        registry.registerAgent(agentGamma, "C", "", "");
    }

    function test_recordActivity_autoRegisterRespectsMaxAgents() public {
        registry.setMaxAgents(1);
        // Fill the cap via direct registration
        registry.registerAgent(agentAlpha, "A", "", "");

        // recordActivity with a new unknown agent should revert — cap is full
        vm.prank(reporter);
        vm.expectRevert("AgentRegistry: capacity reached");
        registry.recordActivity(agentBeta, "swap", 1 ether, 0.003 ether);
    }

    // ============ Multiple Activity Accumulation ============

    function test_multipleTradesAccumulate() public {
        registry.registerAgent(agentAlpha, "AlphaBot", "", "");

        vm.startPrank(reporter);
        for (uint256 i = 0; i < 5; i++) {
            registry.recordActivity(agentAlpha, "swap", 2 ether, 0.006 ether);
        }
        vm.stopPrank();

        (, AgentRegistry.AgentStats memory s) = registry.getAgentInfo(agentAlpha);
        assertEq(s.totalTrades, 5);
        assertEq(s.totalVolume, 10 ether);
        assertEq(s.totalFeesGenerated, 0.03 ether);
    }
}
