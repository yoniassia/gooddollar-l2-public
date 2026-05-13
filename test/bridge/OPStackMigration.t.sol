// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {L2OutputOracle} from "../../src/bridge/L2OutputOracle.sol";
import {OptimismPortal} from "../../src/bridge/OptimismPortal.sol";
import {SystemConfig} from "../../src/bridge/SystemConfig.sol";
import {L1StandardBridge} from "../../src/bridge/L1StandardBridge.sol";

/**
 * @title OPStackMigrationTest
 * @notice End-to-end tests validating the full OP Stack deployment flow.
 *         Simulates what happens when we migrate from Anvil devnet to
 *         the full OP Stack runtime: deploy L1 contracts, initialize,
 *         bridge deposits, propose outputs, finalize withdrawals.
 */
contract OPStackMigrationTest is Test {
    L2OutputOracle oracle;
    OptimismPortal portal;
    SystemConfig config;
    L1StandardBridge bridge;

    address deployer = address(this);
    address proposer;
    address batcher;
    address user = address(0xCAFE);

    function setUp() public {
        // Simulate the deploy-l1.sh flow
        proposer = deployer;  // In devnet, deployer = proposer
        batcher = address(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC);

        // Step 1: Deploy L2OutputOracle
        oracle = new L2OutputOracle();

        // Step 2: Deploy OptimismPortal + initialize
        portal = new OptimismPortal();
        portal.initialize(address(oracle));

        // Step 3: Deploy SystemConfig
        config = new SystemConfig();

        // Step 4: Deploy L1StandardBridge + initialize
        bridge = new L1StandardBridge();
        bridge.initialize(address(portal));

        // Fund the test user
        vm.deal(user, 100 ether);
        vm.deal(address(portal), 100 ether);
        vm.deal(address(bridge), 100 ether);
    }

    // ─── Full E2E deposit → output → withdrawal ────────

    function test_fullDepositWithdrawalCycle() public {
        // 1. User deposits ETH via bridge (L1 → L2)
        vm.prank(user);
        bridge.bridgeETH{value: 5 ether}(100000, bytes(""));

        // UBI fee should be taken on deposit
        uint256 ubiFee = 5 ether * 33 / 10000;
        assertGt(bridge.ubiTreasury().balance, 0, "UBI treasury should receive fee");

        // 2. Proposer submits L2 output root
        bytes32 outputRoot = keccak256(abi.encode(block.number, "output1"));
        oracle.proposeL2Output(outputRoot, 0, bytes32(0), 0);
        assertEq(oracle.latestBlockNumber(), 0);

        // 3. More outputs posted (simulating ongoing sequencing)
        oracle.proposeL2Output(keccak256("o2"), 120, bytes32(0), 0);
        oracle.proposeL2Output(keccak256("o3"), 240, bytes32(0), 0);
        assertEq(oracle.latestBlockNumber(), 240);

        // 4. User finalizes withdrawal (L2 → L1)
        bytes32 wHash = keccak256("user-withdrawal-1");
        address payable recipient = payable(address(0xBEEF));
        uint256 balBefore = recipient.balance;

        portal.finalizeWithdrawalTransaction(wHash, recipient, 2 ether);

        // Withdrawal should have UBI fee deducted
        uint256 expectedFee = 2 ether * portal.ubiFee() / 10000;
        uint256 expectedPayout = 2 ether - expectedFee;
        assertEq(recipient.balance - balBefore, expectedPayout, "Recipient should receive withdrawal minus UBI fee");
    }

    function test_directPortalDeposit() public {
        // Direct deposit via portal (for custom L2 transactions)
        vm.prank(user);
        portal.depositTransaction{value: 3 ether}(
            address(0xDEAD),  // L2 target
            3 ether,           // value
            200000,            // gas limit
            false,             // isCreation
            bytes("")          // data
        );

        assertEq(portal.depositNonce(), 1, "Deposit nonce should increment");
    }

    function test_systemConfigUBIFeeRouting() public {
        // Verify SystemConfig UBI fee is set to 33% by default
        assertEq(config.ubiFeeBps(), 3300, "Default UBI fee should be 33%");

        // Admin can adjust
        config.setUBIFee(5000);
        assertEq(config.ubiFeeBps(), 5000);

        // But not above 100%
        vm.expectRevert("max 100%");
        config.setUBIFee(10001);
    }

    function test_bridgeETHToSpecificRecipient() public {
        address payable recipient = payable(address(0xF00D));
        uint256 balBefore = bridge.ubiTreasury().balance;

        vm.prank(user);
        bridge.bridgeETHTo{value: 2 ether}(recipient, 100000, bytes(""));

        uint256 expectedFee = 2 ether * 33 / 10000;
        assertEq(bridge.ubiTreasury().balance - balBefore, expectedFee, "UBI fee on bridge-to");
    }

    function test_outputOracleSequencing() public {
        // Simulate proposer posting output roots at regular intervals
        for (uint256 i = 0; i < 10; i++) {
            bytes32 root = keccak256(abi.encode("output", i));
            oracle.proposeL2Output(root, i * 120, bytes32(0), 0);
        }

        assertEq(oracle.latestBlockNumber(), 9 * 120);
        assertEq(oracle.nextBlockNumber(), 10 * 120);

        // Verify individual outputs
        L2OutputOracle.OutputProposal memory p = oracle.getL2Output(5);
        assertEq(p.l2BlockNumber, 5 * 120);
    }

    function test_challengerCanDeleteBadOutputs() public {
        // Post 5 outputs
        for (uint256 i = 0; i < 5; i++) {
            oracle.proposeL2Output(keccak256(abi.encode(i)), i * 120, bytes32(0), 0);
        }

        // Challenger deletes from index 3 onward (detects fraud at output 3)
        oracle.deleteL2Outputs(3);
        assertEq(oracle.latestBlockNumber(), 2 * 120);
    }

    function test_portalPauseHaltsDeposits() public {
        // Admin pauses portal (emergency)
        portal.pause();
        assertTrue(portal.paused());

        // Deposits should revert
        vm.prank(user);
        vm.expectRevert("OptimismPortal: paused");
        portal.depositTransaction{value: 1 ether}(address(0), 1 ether, 100000, false, "");

        // Unpause restores functionality
        portal.unpause();
        vm.prank(user);
        portal.depositTransaction{value: 1 ether}(address(0), 1 ether, 100000, false, "");
        assertEq(portal.depositNonce(), 1);
    }

    function test_gasConfigCanBeUpdated() public {
        config.setGasConfig(250, 800000);
        assertEq(config.overhead(), 250);
        assertEq(config.scalar(), 800000);

        config.setGasLimit(60_000_000);
        assertEq(config.gasLimit(), 60_000_000);
    }

    function test_multiUserBridgeDeposits() public {
        address user2 = address(0xBEEF);
        address user3 = address(0xDEAD);
        vm.deal(user2, 50 ether);
        vm.deal(user3, 50 ether);

        uint256 treasuryBefore = bridge.ubiTreasury().balance;

        vm.prank(user);
        bridge.bridgeETH{value: 10 ether}(100000, "");

        vm.prank(user2);
        bridge.bridgeETH{value: 20 ether}(100000, "");

        vm.prank(user3);
        bridge.bridgeETHTo{value: 5 ether}(address(0xF00D), 100000, "");

        uint256 totalDeposited = 35 ether;
        uint256 expectedTotalFee = totalDeposited * 33 / 10000;
        assertEq(
            bridge.ubiTreasury().balance - treasuryBefore,
            expectedTotalFee,
            "Total UBI fees from all deposits"
        );
    }

    receive() external payable {}
}
