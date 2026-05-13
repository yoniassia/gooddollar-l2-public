// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/bridge/MultiChainBridge.sol";

// ─── Mocks ────────────────────────────────────────────────────────────────────

contract MockToken {
    string public name = "Mock Token";
    string public symbol = "MTK";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockLiFiAggregator {
    uint256 public swapCount;
    uint256 public lastSrcAmount;
    uint256 public lastDestChainId;
    address public lastSrcToken;
    address public lastDestToken;
    address public lastReceiver;

    function initiateSwap(
        address srcToken,
        uint256 srcAmount,
        uint256 destChainId,
        address destToken,
        address destReceiver,
        uint256,
        uint256
    ) external returns (uint256) {
        // Pull tokens from caller
        IERC20(srcToken).transferFrom(msg.sender, address(this), srcAmount);
        lastSrcToken = srcToken;
        lastSrcAmount = srcAmount;
        lastDestChainId = destChainId;
        lastDestToken = destToken;
        lastReceiver = destReceiver;
        return swapCount++;
    }

    function initiateSwapETH(
        uint256 destChainId,
        address destToken,
        address destReceiver,
        uint256,
        uint256
    ) external payable returns (uint256) {
        lastSrcAmount = msg.value;
        lastDestChainId = destChainId;
        lastDestToken = destToken;
        lastReceiver = destReceiver;
        return swapCount++;
    }

    receive() external payable {}
}

contract MockNativeBridge {
    uint256 public lastAmount;
    address public lastToken;
    address public lastReceiver;
    bool public ethWithdrawalCalled;

    function initiateWithdrawal(address token, address to, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        lastToken = token;
        lastReceiver = to;
        lastAmount = amount;
    }

    function initiateETHWithdrawal(address to) external payable {
        lastReceiver = to;
        lastAmount = msg.value;
        ethWithdrawalCalled = true;
    }

    receive() external payable {}
}

contract MockFastWithdrawalLP {
    function claimFastWithdrawal(address, uint256, address, bytes32) external {}
    receive() external payable {}
}

// ─── Tests ────────────────────────────────────────────────────────────────────

contract MultiChainBridgeTest is Test {
    MultiChainBridge public bridge;
    MockToken public token;
    MockLiFiAggregator public lifi;
    MockNativeBridge public nativeBridge;
    MockFastWithdrawalLP public fastLP;

    address admin = address(0xAD);
    address ubiPool = address(0xBB);
    address alice = address(0xA1);
    address bob = address(0xB0);

    function setUp() public {
        lifi = new MockLiFiAggregator();
        nativeBridge = new MockNativeBridge();
        fastLP = new MockFastWithdrawalLP();
        token = new MockToken();

        bridge = new MultiChainBridge(
            admin,
            ubiPool,
            address(lifi),
            address(nativeBridge),
            address(fastLP)
        );

        // Setup token mappings
        vm.startPrank(admin);
        bridge.setTokenMapping(address(token), 42161, address(0xABCD)); // Arbitrum dest token
        bridge.setTokenMapping(address(token), 10, address(0xDEF0));    // Optimism dest token
        bridge.setTokenMapping(address(token), 137, address(0x1337));   // Polygon dest token
        vm.stopPrank();

        // Fund alice
        token.mint(alice, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(address(bridge), 0);
    }

    // ─── Route info ───────────────────────────────────────────────────────────

    function test_getRouteInfo_nativeBridge() public view {
        (MultiChainBridge.RouteType rt, string memory desc) = bridge.getRouteInfo(1, false);
        assertEq(uint(rt), uint(MultiChainBridge.RouteType.NativeBridge));
        assertTrue(bytes(desc).length > 0);
    }

    function test_getRouteInfo_fastWithdrawal() public view {
        (MultiChainBridge.RouteType rt,) = bridge.getRouteInfo(1, true);
        assertEq(uint(rt), uint(MultiChainBridge.RouteType.FastWithdrawal));
    }

    function test_getRouteInfo_lifi() public view {
        (MultiChainBridge.RouteType rt,) = bridge.getRouteInfo(42161, false);
        assertEq(uint(rt), uint(MultiChainBridge.RouteType.LiFiCrossChain));
    }

    // ─── ERC20 bridge via Li.Fi ───────────────────────────────────────────────

    function test_bridgeTokens_lifi_arbitrum() public {
        uint256 amount = 10 ether;
        vm.startPrank(alice);
        token.approve(address(bridge), amount);

        uint256 requestId = bridge.bridgeTokens(
            address(token), amount, 42161, bob, 9 ether, block.timestamp + 3600, false
        );
        vm.stopPrank();

        assertEq(requestId, 0);

        // Check fee deduction: 0.05% of 10 ether = 0.005 ether
        uint256 fee = (amount * 5) / 10_000;
        uint256 ubiShare = (fee * 3333) / 10_000;
        uint256 netAmount = amount - fee;

        // LiFi received net amount
        assertEq(lifi.lastSrcAmount(), netAmount);
        assertEq(lifi.lastDestChainId(), 42161);
        assertEq(lifi.lastReceiver(), bob);

        // UBI pool received its share
        assertEq(token.balanceOf(ubiPool), ubiShare);

        // Request tracked
        (address user,,,,,,,,) = bridge.requests(requestId);
        assertEq(user, alice);
    }

    function test_bridgeTokens_lifi_polygon() public {
        uint256 amount = 5 ether;
        vm.startPrank(alice);
        token.approve(address(bridge), amount);
        bridge.bridgeTokens(address(token), amount, 137, bob, 4 ether, block.timestamp + 3600, false);
        vm.stopPrank();

        assertEq(lifi.lastDestChainId(), 137);
    }

    function test_bridgeTokens_nativeBridge_L1() public {
        uint256 amount = 10 ether;
        vm.startPrank(alice);
        token.approve(address(bridge), amount);
        bridge.bridgeTokens(address(token), amount, 1, bob, 0, block.timestamp + 3600, false);
        vm.stopPrank();

        uint256 fee = (amount * 5) / 10_000;
        uint256 netAmount = amount - fee;
        assertEq(nativeBridge.lastAmount(), netAmount);
        assertEq(nativeBridge.lastReceiver(), bob);
    }

    function test_bridgeTokens_fastWithdrawal() public {
        uint256 amount = 10 ether;
        vm.startPrank(alice);
        token.approve(address(bridge), amount);
        uint256 requestId = bridge.bridgeTokens(
            address(token), amount, 1, bob, 0, block.timestamp + 3600, true
        );
        vm.stopPrank();

        // Fast withdrawal holds tokens in contract (not sent to native bridge or lifi)
        (,,,,,,,, bool completed) = bridge.requests(requestId);
        assertFalse(completed); // Pending — LP needs to fill
    }

    // ─── ETH bridge ──────────────────────────────────────────────────────────

    function test_bridgeETH_lifi() public {
        vm.prank(alice);
        bridge.bridgeETH{value: 5 ether}(42161, bob, 4 ether, block.timestamp + 3600, false);

        uint256 fee = (5 ether * 5) / 10_000;
        uint256 net = 5 ether - fee;
        assertEq(lifi.lastSrcAmount(), net);
    }

    function test_bridgeETH_nativeBridge() public {
        vm.prank(alice);
        bridge.bridgeETH{value: 5 ether}(1, bob, 0, block.timestamp + 3600, false);

        uint256 fee = (5 ether * 5) / 10_000;
        uint256 net = 5 ether - fee;
        assertEq(nativeBridge.lastAmount(), net);
        assertTrue(nativeBridge.ethWithdrawalCalled());
    }

    function test_bridgeETH_fastWithdrawal() public {
        vm.prank(alice);
        uint256 rid = bridge.bridgeETH{value: 5 ether}(1, bob, 0, block.timestamp + 3600, true);

        (,,,,,,,, bool completed) = bridge.requests(rid);
        assertFalse(completed);
    }

    // ─── UBI fee ──────────────────────────────────────────────────────────────

    function test_ubiFeeCollected_erc20() public {
        uint256 amount = 100 ether;
        vm.startPrank(alice);
        token.approve(address(bridge), amount);
        bridge.bridgeTokens(address(token), amount, 42161, bob, 90 ether, block.timestamp + 3600, false);
        vm.stopPrank();

        uint256 fee = (amount * 5) / 10_000;            // 0.05 ether
        uint256 ubiShare = (fee * 3333) / 10_000;       // ~0.01666 ether
        assertEq(token.balanceOf(ubiPool), ubiShare);
    }

    function test_ubiFeeCollected_eth() public {
        vm.prank(alice);
        bridge.bridgeETH{value: 100 ether}(42161, bob, 90 ether, block.timestamp + 3600, false);

        uint256 fee = (100 ether * 5) / 10_000;
        uint256 ubiShare = (fee * 3333) / 10_000;
        assertEq(ubiPool.balance, ubiShare);
    }

    // ─── Reverts ──────────────────────────────────────────────────────────────

    function test_revert_zeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(MultiChainBridge.ZeroAmount.selector);
        bridge.bridgeTokens(address(token), 0, 42161, bob, 0, block.timestamp + 3600, false);
    }

    function test_revert_alreadyOnL2() public {
        vm.startPrank(alice);
        token.approve(address(bridge), 1 ether);
        vm.expectRevert(MultiChainBridge.AlreadyOnL2.selector);
        bridge.bridgeTokens(address(token), 1 ether, 42069, bob, 0, block.timestamp + 3600, false);
        vm.stopPrank();
    }

    function test_revert_unsupportedChain() public {
        vm.startPrank(alice);
        token.approve(address(bridge), 1 ether);
        vm.expectRevert(abi.encodeWithSelector(MultiChainBridge.UnsupportedChain.selector, 999));
        bridge.bridgeTokens(address(token), 1 ether, 999, bob, 0, block.timestamp + 3600, false);
        vm.stopPrank();
    }

    function test_revert_noTokenMapping() public {
        MockToken otherToken = new MockToken();
        otherToken.mint(alice, 10 ether);

        vm.startPrank(alice);
        otherToken.approve(address(bridge), 1 ether);
        vm.expectRevert(abi.encodeWithSelector(
            MultiChainBridge.NoTokenMapping.selector, address(otherToken), uint256(42161)
        ));
        bridge.bridgeTokens(address(otherToken), 1 ether, 42161, bob, 0, block.timestamp + 3600, false);
        vm.stopPrank();
    }

    function test_revert_zeroAddress_receiver() public {
        vm.startPrank(alice);
        token.approve(address(bridge), 1 ether);
        vm.expectRevert(MultiChainBridge.ZeroAddress.selector);
        bridge.bridgeTokens(address(token), 1 ether, 42161, address(0), 0, block.timestamp + 3600, false);
        vm.stopPrank();
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function test_admin_setRoutingFee() public {
        vm.prank(admin);
        bridge.setRoutingFeeBps(20);
        assertEq(bridge.routingFeeBps(), 20);
    }

    function test_admin_setSupportedChain() public {
        vm.prank(admin);
        bridge.setSupportedChain(324, true); // zkSync
        assertTrue(bridge.supportedChains(324));
    }

    function test_admin_batchSetTokenMappings() public {
        address[] memory tokens = new address[](2);
        tokens[0] = address(token);
        tokens[1] = address(token);
        uint256[] memory chains = new uint256[](2);
        chains[0] = 324;   // zkSync
        chains[1] = 8453;  // Base
        address[] memory dests = new address[](2);
        dests[0] = address(0x1111);
        dests[1] = address(0x2222);

        vm.prank(admin);
        bridge.batchSetTokenMappings(tokens, chains, dests);

        assertEq(bridge.tokenMappings(address(token), 324), address(0x1111));
        assertEq(bridge.tokenMappings(address(token), 8453), address(0x2222));
    }

    function test_admin_withdrawFees() public {
        // Accumulate some protocol fees
        vm.startPrank(alice);
        token.approve(address(bridge), 100 ether);
        bridge.bridgeTokens(address(token), 100 ether, 1, bob, 0, block.timestamp + 3600, true);
        vm.stopPrank();

        uint256 contractBal = token.balanceOf(address(bridge));
        assertTrue(contractBal > 0);

        vm.prank(admin);
        bridge.withdrawProtocolFees(address(token), contractBal, admin);
        assertEq(token.balanceOf(admin), contractBal);
    }

    function test_revert_nonAdmin() public {
        vm.prank(alice);
        vm.expectRevert(MultiChainBridge.NotAdmin.selector);
        bridge.setRoutingFeeBps(50);
    }

    // ─── User request tracking ────────────────────────────────────────────────

    function test_userRequests_tracked() public {
        vm.startPrank(alice);
        token.approve(address(bridge), 20 ether);
        bridge.bridgeTokens(address(token), 5 ether, 42161, bob, 4 ether, block.timestamp + 3600, false);
        bridge.bridgeTokens(address(token), 5 ether, 137, bob, 4 ether, block.timestamp + 3600, false);
        vm.stopPrank();

        uint256[] memory reqs = bridge.getUserRequests(alice);
        assertEq(reqs.length, 2);
        assertEq(reqs[0], 0);
        assertEq(reqs[1], 1);
    }
}
