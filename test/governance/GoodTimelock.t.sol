// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/governance/GoodTimelock.sol";

contract Counter {
    uint256 public value;
    function increment() external { value++; }
    function setValue(uint256 v) external { value = v; }
    function fail_always() external pure { revert("nope"); }
}

contract GoodTimelockTest is Test {
    GoodTimelock timelock;
    Counter counter;

    address proposer = address(0xA);
    address executor = address(0xB);
    address admin    = address(0xC);
    address ubi      = address(0xD);
    address nobody   = address(0xE);

    uint256 constant DELAY = 1 days;

    function setUp() public {
        address[] memory proposers = new address[](1);
        proposers[0] = proposer;
        address[] memory executors = new address[](1);
        executors[0] = executor;

        timelock = new GoodTimelock(DELAY, proposers, executors, admin, ubi);
        counter = new Counter();
    }

    // --- Scheduling ---

    function test_schedule_single() public {
        bytes memory data = abi.encodeCall(Counter.increment, ());
        vm.prank(proposer);
        bytes32 id = timelock.schedule(address(counter), 0, data, bytes32(0));
        assertTrue(timelock.isOperationPending(id));
        assertFalse(timelock.isOperationReady(id));
    }

    function test_schedule_batch() public {
        address[] memory targets = new address[](2);
        uint256[] memory values = new uint256[](2);
        bytes[] memory calldatas = new bytes[](2);

        targets[0] = address(counter);
        targets[1] = address(counter);
        calldatas[0] = abi.encodeCall(Counter.increment, ());
        calldatas[1] = abi.encodeCall(Counter.setValue, (42));

        vm.prank(proposer);
        bytes32 id = timelock.scheduleBatch(targets, values, calldatas, bytes32(0));
        assertTrue(timelock.isOperationPending(id));
    }

    function test_schedule_revert_not_proposer() public {
        vm.prank(nobody);
        vm.expectRevert(GoodTimelock.NotProposer.selector);
        timelock.schedule(address(counter), 0, "", bytes32(0));
    }

    function test_schedule_revert_duplicate() public {
        bytes memory data = abi.encodeCall(Counter.increment, ());
        vm.prank(proposer);
        timelock.schedule(address(counter), 0, data, bytes32(0));
        vm.prank(proposer);
        vm.expectRevert(GoodTimelock.OperationAlreadyQueued.selector);
        timelock.schedule(address(counter), 0, data, bytes32(0));
    }

    // --- Execution ---

    function test_execute_after_delay() public {
        bytes memory data = abi.encodeCall(Counter.increment, ());
        vm.prank(proposer);
        timelock.schedule(address(counter), 0, data, bytes32(0));

        vm.warp(block.timestamp + DELAY);
        vm.prank(executor);
        timelock.execute(address(counter), 0, data, bytes32(0));

        assertEq(counter.value(), 1);

        // Check marked as done
        address[] memory t = new address[](1);
        uint256[] memory v = new uint256[](1);
        bytes[] memory c = new bytes[](1);
        t[0] = address(counter); c[0] = data;
        bytes32 id = timelock.hashOperationBatch(t, v, c, bytes32(0));
        assertTrue(timelock.isOperationDone(id));
    }

    function test_executeBatch() public {
        address[] memory targets = new address[](2);
        uint256[] memory values = new uint256[](2);
        bytes[] memory calldatas = new bytes[](2);
        targets[0] = address(counter);
        targets[1] = address(counter);
        calldatas[0] = abi.encodeCall(Counter.increment, ());
        calldatas[1] = abi.encodeCall(Counter.increment, ());

        vm.prank(proposer);
        timelock.scheduleBatch(targets, values, calldatas, bytes32(0));

        vm.warp(block.timestamp + DELAY);
        vm.prank(executor);
        timelock.executeBatch(targets, values, calldatas, bytes32(0));

        assertEq(counter.value(), 2);
    }

    function test_execute_revert_not_ready() public {
        bytes memory data = abi.encodeCall(Counter.increment, ());
        vm.prank(proposer);
        timelock.schedule(address(counter), 0, data, bytes32(0));

        // Don't warp — still in delay
        vm.prank(executor);
        vm.expectRevert(GoodTimelock.OperationNotReady.selector);
        timelock.execute(address(counter), 0, data, bytes32(0));
    }

    function test_execute_revert_expired() public {
        bytes memory data = abi.encodeCall(Counter.increment, ());
        vm.prank(proposer);
        timelock.schedule(address(counter), 0, data, bytes32(0));

        vm.warp(block.timestamp + DELAY + 14 days + 1);
        vm.prank(executor);
        vm.expectRevert(GoodTimelock.OperationExpired.selector);
        timelock.execute(address(counter), 0, data, bytes32(0));
    }

    function test_execute_revert_not_executor() public {
        bytes memory data = abi.encodeCall(Counter.increment, ());
        vm.prank(proposer);
        timelock.schedule(address(counter), 0, data, bytes32(0));

        vm.warp(block.timestamp + DELAY);
        vm.prank(nobody);
        vm.expectRevert(GoodTimelock.NotExecutor.selector);
        timelock.execute(address(counter), 0, data, bytes32(0));
    }

    function test_execute_revert_call_fails() public {
        bytes memory data = abi.encodeCall(Counter.fail_always, ());
        vm.prank(proposer);
        timelock.schedule(address(counter), 0, data, bytes32(0));

        vm.warp(block.timestamp + DELAY);
        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(GoodTimelock.ExecutionFailed.selector, 0));
        timelock.execute(address(counter), 0, data, bytes32(0));
    }

    // --- Predecessor ---

    function test_execute_with_predecessor() public {
        bytes memory data1 = abi.encodeCall(Counter.increment, ());
        bytes memory data2 = abi.encodeCall(Counter.setValue, (99));

        vm.startPrank(proposer);
        bytes32 id1 = timelock.schedule(address(counter), 0, data1, bytes32(0));
        timelock.schedule(address(counter), 0, data2, id1);
        vm.stopPrank();

        vm.warp(block.timestamp + DELAY);

        // Can't execute data2 before data1
        vm.prank(executor);
        vm.expectRevert(GoodTimelock.PredecessorNotExecuted.selector);
        timelock.execute(address(counter), 0, data2, id1);

        // Execute data1 first
        vm.prank(executor);
        timelock.execute(address(counter), 0, data1, bytes32(0));

        // Now data2 works
        vm.prank(executor);
        timelock.execute(address(counter), 0, data2, id1);
        assertEq(counter.value(), 99);
    }

    // --- Cancel ---

    function test_cancel() public {
        bytes memory data = abi.encodeCall(Counter.increment, ());
        vm.prank(proposer);
        bytes32 id = timelock.schedule(address(counter), 0, data, bytes32(0));

        vm.prank(proposer);
        timelock.cancel(id);
        assertFalse(timelock.isOperationPending(id));
    }

    function test_cancel_revert_not_proposer() public {
        bytes memory data = abi.encodeCall(Counter.increment, ());
        vm.prank(proposer);
        bytes32 id = timelock.schedule(address(counter), 0, data, bytes32(0));

        vm.prank(nobody);
        vm.expectRevert(GoodTimelock.NotProposer.selector);
        timelock.cancel(id);
    }

    // --- Admin ---

    function test_admin_set_proposer() public {
        vm.prank(admin);
        timelock.setProposer(nobody, true);
        assertTrue(timelock.isProposer(nobody));

        // nobody can now schedule
        vm.prank(nobody);
        timelock.schedule(address(counter), 0, "", bytes32(0));
    }

    function test_admin_set_executor() public {
        vm.prank(admin);
        timelock.setExecutor(nobody, true);
        assertTrue(timelock.isExecutor(nobody));
    }

    function test_admin_transfer() public {
        vm.prank(admin);
        timelock.transferAdmin(nobody);
        assertEq(timelock.admin(), nobody);
    }

    function test_updateDelay_onlySelf() public {
        // Must be called through timelock itself
        vm.prank(admin);
        vm.expectRevert(GoodTimelock.NotSelf.selector);
        timelock.updateDelay(2 days);

        // Schedule delay update through timelock
        bytes memory data = abi.encodeCall(GoodTimelock.updateDelay, (2 days));
        vm.prank(proposer);
        timelock.schedule(address(timelock), 0, data, bytes32(0));
        vm.warp(block.timestamp + DELAY);
        vm.prank(executor);
        timelock.execute(address(timelock), 0, data, bytes32(0));

        assertEq(timelock.delay(), 2 days);
    }

    // --- Constructor Validation ---

    function test_constructor_revert_invalid_delay() public {
        address[] memory p = new address[](0);
        address[] memory e = new address[](0);
        vm.expectRevert(GoodTimelock.InvalidDelay.selector);
        new GoodTimelock(0, p, e, admin, ubi);
    }

    // --- View Helpers ---

    function test_hash_deterministic() public view {
        address[] memory t = new address[](1);
        uint256[] memory v = new uint256[](1);
        bytes[] memory c = new bytes[](1);
        t[0] = address(counter);
        c[0] = abi.encodeCall(Counter.increment, ());

        bytes32 h1 = timelock.hashOperationBatch(t, v, c, bytes32(0));
        bytes32 h2 = timelock.hashOperationBatch(t, v, c, bytes32(0));
        assertEq(h1, h2);
    }

    function test_open_executor() public {
        // Deploy with address(0) as executor = anyone can execute
        address[] memory proposers = new address[](1);
        proposers[0] = proposer;
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        GoodTimelock openTimelock = new GoodTimelock(DELAY, proposers, executors, admin, ubi);

        bytes memory data = abi.encodeCall(Counter.increment, ());
        vm.prank(proposer);
        openTimelock.schedule(address(counter), 0, data, bytes32(0));
        vm.warp(block.timestamp + DELAY);

        // Random address can execute
        vm.prank(nobody);
        openTimelock.execute(address(counter), 0, data, bytes32(0));
        assertEq(counter.value(), 1);
    }

    // --- ETH Handling ---

    function test_execute_with_eth() public {
        vm.deal(address(timelock), 1 ether);
        bytes memory data = "";
        // Use an EOA-like payable address
        address payable recipient = payable(address(0xF00));

        vm.prank(proposer);
        timelock.schedule(recipient, 0.5 ether, data, bytes32(0));
        vm.warp(block.timestamp + DELAY);

        vm.prank(executor);
        timelock.execute(recipient, 0.5 ether, data, bytes32(0));
        assertEq(recipient.balance, 0.5 ether);
    }

    function test_receive_eth() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(timelock).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(timelock).balance, 1 ether);
    }
}
