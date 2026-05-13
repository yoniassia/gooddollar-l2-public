// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {L2OutputOracle} from "../../src/bridge/L2OutputOracle.sol";
import {OptimismPortal} from "../../src/bridge/OptimismPortal.sol";
import {SystemConfig} from "../../src/bridge/SystemConfig.sol";
import {L1StandardBridge} from "../../src/bridge/L1StandardBridge.sol";

contract L2OutputOracleTest is Test {
    L2OutputOracle oracle;

    function setUp() public {
        oracle = new L2OutputOracle();
    }

    function test_proposeOutput() public {
        bytes32 root = keccak256("output1");
        oracle.proposeL2Output(root, 0, bytes32(0), 0);

        L2OutputOracle.OutputProposal memory output = oracle.getL2Output(0);
        assertEq(output.outputRoot, root);
        assertEq(output.l2BlockNumber, 0);
    }

    function test_proposeMultipleOutputs() public {
        oracle.proposeL2Output(keccak256("o1"), 0, bytes32(0), 0);
        oracle.proposeL2Output(keccak256("o2"), 120, bytes32(0), 0);
        oracle.proposeL2Output(keccak256("o3"), 240, bytes32(0), 0);

        assertEq(oracle.latestBlockNumber(), 240);
        assertEq(oracle.nextBlockNumber(), 360);
    }

    function test_deleteOutputs() public {
        oracle.proposeL2Output(keccak256("o1"), 0, bytes32(0), 0);
        oracle.proposeL2Output(keccak256("o2"), 120, bytes32(0), 0);

        oracle.deleteL2Outputs(1);
        assertEq(oracle.latestBlockNumber(), 0);
    }

    function test_revert_nonProposerCannotPropose() public {
        vm.prank(address(0xdead));
        vm.expectRevert("L2OutputOracle: only proposer");
        oracle.proposeL2Output(keccak256("bad"), 0, bytes32(0), 0);
    }

    function test_nextBlockStartsAtZero() public view {
        assertEq(oracle.nextBlockNumber(), 0);
    }
}

contract OptimismPortalTest is Test {
    OptimismPortal portal;
    L2OutputOracle oracle;

    function setUp() public {
        oracle = new L2OutputOracle();
        portal = new OptimismPortal();
        portal.initialize(address(oracle));
    }

    function test_depositETH() public {
        vm.deal(address(this), 10 ether);
        portal.depositTransaction{value: 1 ether}(
            address(0xBEEF), 1 ether, 100000, false, bytes("")
        );
        assertEq(portal.depositNonce(), 1);
    }

    function test_depositViaReceive() public {
        vm.deal(address(this), 10 ether);
        (bool ok,) = address(portal).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(portal.depositNonce(), 1);
    }

    function test_pauseUnpause() public {
        portal.pause();
        assertTrue(portal.paused());

        portal.unpause();
        assertFalse(portal.paused());
    }

    function test_revert_depositWhenPaused() public {
        portal.pause();
        vm.deal(address(this), 1 ether);
        vm.expectRevert("OptimismPortal: paused");
        portal.depositTransaction{value: 1 ether}(
            address(0xBEEF), 1 ether, 100000, false, bytes("")
        );
    }

    function test_ubiFeeOnWithdrawal() public {
        vm.deal(address(portal), 10 ether);
        address payable recipient = payable(address(0xCAFE));

        bytes32 hash = keccak256("withdrawal1");
        portal.finalizeWithdrawalTransaction(hash, recipient, 1 ether);

        uint256 expectedPayout = 1 ether - (1 ether * 33 / 10000);
        assertEq(recipient.balance, expectedPayout);
        assertTrue(portal.finalizedWithdrawals(hash));
    }

    function test_revert_doubleFinalize() public {
        vm.deal(address(portal), 10 ether);
        bytes32 hash = keccak256("w1");
        portal.finalizeWithdrawalTransaction(hash, payable(address(0xCAFE)), 1 ether);

        vm.expectRevert("already finalized");
        portal.finalizeWithdrawalTransaction(hash, payable(address(0xCAFE)), 1 ether);
    }

    function test_setUBIFee() public {
        portal.setUBIFee(100);
        assertEq(portal.ubiFee(), 100);
    }

    function test_revert_ubiFeeMax() public {
        vm.expectRevert("fee too high");
        portal.setUBIFee(1001);
    }

    receive() external payable {}
}

contract SystemConfigTest is Test {
    SystemConfig config;

    function setUp() public {
        config = new SystemConfig();
    }

    function test_defaults() public view {
        assertEq(config.overhead(), 188);
        assertEq(config.scalar(), 684000);
        assertEq(config.gasLimit(), 30_000_000);
        assertEq(config.ubiFeeBps(), 3300);
    }

    function test_setGasConfig() public {
        config.setGasConfig(200, 700000);
        assertEq(config.overhead(), 200);
        assertEq(config.scalar(), 700000);
    }

    function test_setGasLimit() public {
        config.setGasLimit(50_000_000);
        assertEq(config.gasLimit(), 50_000_000);
    }

    function test_revert_gasLimitTooLow() public {
        vm.expectRevert("gas limit too low");
        config.setGasLimit(100);
    }

    function test_setUBIFee() public {
        config.setUBIFee(5000);
        assertEq(config.ubiFeeBps(), 5000);
    }

    function test_transferOwnership() public {
        config.transferOwnership(address(0xBEEF));
        assertEq(config.owner(), address(0xBEEF));
    }
}

contract L1StandardBridgeTest is Test {
    L1StandardBridge bridge;

    function setUp() public {
        bridge = new L1StandardBridge();
    }

    function test_bridgeETH() public {
        vm.deal(address(this), 10 ether);
        bridge.bridgeETH{value: 1 ether}(100000, bytes(""));
    }

    function test_bridgeETHTo() public {
        vm.deal(address(this), 10 ether);
        bridge.bridgeETHTo{value: 1 ether}(address(0xBEEF), 100000, bytes(""));
    }

    function test_ubiFeeOnBridge() public {
        // Use a separate sender so treasury (deployer = this) balance is clean
        address sender = address(0x1234);
        vm.deal(sender, 10 ether);

        address treasury = bridge.ubiTreasury();
        uint256 balBefore = treasury.balance;

        vm.prank(sender);
        bridge.bridgeETH{value: 1 ether}(100000, bytes(""));

        uint256 fee = 1 ether * 33 / 10000;
        assertEq(treasury.balance - balBefore, fee);
    }

    function test_finalizeETHWithdrawal() public {
        vm.deal(address(bridge), 10 ether);
        address payable recipient = payable(address(0xCAFE));

        bridge.finalizeETHWithdrawal(address(0xBEEF), recipient, 1 ether, bytes(""));
        assertEq(recipient.balance, 1 ether);
    }

    function test_setUBIFee() public {
        bridge.setUBIFee(100);
        assertEq(bridge.ubiFee(), 100);
    }

    function test_revert_setBridgeFeeMax() public {
        vm.expectRevert("max 10%");
        bridge.setUBIFee(1001);
    }

    receive() external payable {}
}
