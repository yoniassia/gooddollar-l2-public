// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/bridge/GoodDollarBridgeL1.sol";
import "../src/bridge/GoodDollarBridgeL2.sol";
import "../src/GoodDollarToken.sol";

// Mock ERC20 for USDC
contract MockUSDC {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function burn(address from, uint256 amount) external {
        require(balanceOf[from] >= amount, "Insufficient balance");
        totalSupply -= amount;
        balanceOf[from] -= amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        require(balanceOf[from] >= amount, "Insufficient balance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

// Mock L2 token (mintable/burnable)
contract MockL2Token {
    string public name;
    string public symbol;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    address public bridge;

    constructor(string memory _name, string memory _symbol, address _bridge) {
        name = _name;
        symbol = _symbol;
        bridge = _bridge;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == bridge, "Only bridge");
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == bridge, "Only bridge");
        require(balanceOf[from] >= amount, "Insufficient balance");
        totalSupply -= amount;
        balanceOf[from] -= amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

// Mock cross-domain messenger that simulates L1<->L2 message relay
contract MockL1Messenger {
    address public xDomainMessageSenderVal;
    address public lastTarget;
    bytes public lastMessage;
    uint32 public lastGasLimit;
    bool public shouldRelay;

    function sendMessage(address target, bytes calldata message, uint32 gasLimit) external {
        lastTarget = target;
        lastMessage = message;
        lastGasLimit = gasLimit;
    }

    function xDomainMessageSender() external view returns (address) {
        return xDomainMessageSenderVal;
    }

    function setXDomainMessageSender(address sender) external {
        xDomainMessageSenderVal = sender;
    }

    function relayMessage(address target) external {
        (bool success, ) = target.call(lastMessage);
        require(success, "Relay failed");
    }
}

// Malicious contract that re-enters finalizeETHDeposit when it receives ETH
contract ReentrantDeposit {
    GoodDollarBridgeL2 public bridge;
    address public messenger;
    address public l1Bridge;
    bool public attacked;

    constructor(address _bridge, address _messenger, address _l1Bridge) {
        bridge = GoodDollarBridgeL2(payable(_bridge));
        messenger = _messenger;
        l1Bridge = _l1Bridge;
    }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            // Attempt reentrant call into finalizeETHDeposit
            MockL1Messenger(messenger).setXDomainMessageSender(l1Bridge);
            vm.prank(messenger);
            bridge.finalizeETHDeposit(address(this), address(this), msg.value);
        }
    }

    // Forge cheatcode reference — needed for vm.prank inside receive()
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
}

contract GoodDollarBridgeTest is Test {
    GoodDollarBridgeL1 public l1Bridge;
    GoodDollarBridgeL2 public l2Bridge;
    GoodDollarToken public gd;
    MockUSDC public usdc;
    MockL1Messenger public l1Messenger;
    MockL1Messenger public l2Messenger;
    MockL2Token public l2GD;
    MockL2Token public l2USDC;

    address public admin = address(0xAD);
    address public user = address(0xBEEF);
    address public recipient = address(0xCAFE);

    uint256 constant INITIAL_SUPPLY = 1_000_000e18;
    uint256 constant DEPOSIT_AMOUNT = 10_000e18;
    uint256 constant USDC_AMOUNT = 10_000e6;

    function setUp() public {
        // Deploy tokens
        gd = new GoodDollarToken(admin, admin, INITIAL_SUPPLY);
        usdc = new MockUSDC();

        // Deploy messengers
        l1Messenger = new MockL1Messenger();
        l2Messenger = new MockL1Messenger();

        // Deploy bridges
        l1Bridge = new GoodDollarBridgeL1(
            address(l1Messenger),
            address(gd),
            address(usdc),
            admin
        );
        l2Bridge = new GoodDollarBridgeL2(
            address(l2Messenger),
            admin
        );

        // Deploy L2 tokens
        l2GD = new MockL2Token("GoodDollar L2", "G$", address(l2Bridge));
        l2USDC = new MockL2Token("USDC L2", "USDC", address(l2Bridge));

        // Configure bridges
        vm.startPrank(admin);
        l1Bridge.setL2Bridge(address(l2Bridge));
        l2Bridge.setL1Bridge(address(l1Bridge));
        l2Bridge.mapToken(address(gd), address(l2GD));
        l2Bridge.mapToken(address(usdc), address(l2USDC));
        vm.stopPrank();

        // Fund user with G$ and USDC
        vm.prank(admin);
        gd.transfer(user, 100_000e18);
        usdc.mint(user, 100_000e6);

        // Approve bridge
        vm.startPrank(user);
        gd.approve(address(l1Bridge), type(uint256).max);
        usdc.approve(address(l1Bridge), type(uint256).max);
        vm.stopPrank();
    }

    // ============ L1 Constructor Tests ============

    function test_l1Bridge_constructor() public view {
        assertEq(address(l1Bridge.messenger()), address(l1Messenger));
        assertEq(address(l1Bridge.goodDollar()), address(gd));
        assertEq(address(l1Bridge.usdc()), address(usdc));
        assertEq(l1Bridge.admin(), admin);
        assertEq(l1Bridge.l2Bridge(), address(l2Bridge));
    }

    function test_l1Bridge_constructor_revertsZeroMessenger() public {
        vm.expectRevert(GoodDollarBridgeL1.ZeroAddress.selector);
        new GoodDollarBridgeL1(address(0), address(gd), address(usdc), admin);
    }

    function test_l1Bridge_constructor_revertsZeroToken() public {
        vm.expectRevert(GoodDollarBridgeL1.ZeroAddress.selector);
        new GoodDollarBridgeL1(address(l1Messenger), address(0), address(usdc), admin);
    }

    // ============ G$ Deposit Tests ============

    function test_depositGDollar_locksTokens() public {
        uint256 balBefore = gd.balanceOf(user);

        vm.prank(user);
        l1Bridge.depositGDollar(recipient, DEPOSIT_AMOUNT);

        assertEq(gd.balanceOf(user), balBefore - DEPOSIT_AMOUNT);
        assertEq(gd.balanceOf(address(l1Bridge)), DEPOSIT_AMOUNT);
        assertEq(l1Bridge.totalGDollarLocked(), DEPOSIT_AMOUNT);
        assertEq(l1Bridge.deposits(address(gd), user), DEPOSIT_AMOUNT);
    }

    function test_depositGDollar_sendsMessage() public {
        vm.prank(user);
        l1Bridge.depositGDollar(recipient, DEPOSIT_AMOUNT);

        assertEq(l1Messenger.lastTarget(), address(l2Bridge));
        assertEq(l1Messenger.lastGasLimit(), 200_000);
        assertTrue(l1Messenger.lastMessage().length > 0);
    }

    function test_depositGDollar_emitsEvent() public {
        vm.prank(user);
        vm.expectEmit(true, true, true, false);
        emit GoodDollarBridgeL1.DepositInitiated(address(gd), user, recipient, DEPOSIT_AMOUNT, bytes32(0));
        l1Bridge.depositGDollar(recipient, DEPOSIT_AMOUNT);
    }

    function test_depositGDollar_revertsZeroAmount() public {
        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL1.ZeroAmount.selector);
        l1Bridge.depositGDollar(recipient, 0);
    }

    function test_depositGDollar_revertsZeroRecipient() public {
        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL1.ZeroAddress.selector);
        l1Bridge.depositGDollar(address(0), DEPOSIT_AMOUNT);
    }

    function test_depositGDollar_revertsPaused() public {
        vm.prank(admin);
        l1Bridge.setPaused(true);

        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL1.BridgePaused.selector);
        l1Bridge.depositGDollar(recipient, DEPOSIT_AMOUNT);
    }

    // ============ USDC Deposit Tests ============

    function test_depositUSDC_locksTokens() public {
        vm.prank(user);
        l1Bridge.depositUSDC(recipient, USDC_AMOUNT);

        assertEq(usdc.balanceOf(address(l1Bridge)), USDC_AMOUNT);
        assertEq(l1Bridge.totalUSDCLocked(), USDC_AMOUNT);
    }

    // ============ ETH Deposit Tests ============

    function test_depositETH_locksETH() public {
        vm.deal(user, 10 ether);

        vm.prank(user);
        l1Bridge.depositETH{value: 1 ether}(recipient);

        assertEq(address(l1Bridge).balance, 1 ether);
        assertEq(l1Bridge.totalETHLocked(), 1 ether);
    }

    function test_depositETH_emitsEvent() public {
        vm.deal(user, 10 ether);

        vm.prank(user);
        vm.expectEmit(true, true, false, true);
        emit GoodDollarBridgeL1.ETHDepositInitiated(user, recipient, 1 ether);
        l1Bridge.depositETH{value: 1 ether}(recipient);
    }

    function test_depositETH_revertsZeroValue() public {
        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL1.ZeroAmount.selector);
        l1Bridge.depositETH{value: 0}(recipient);
    }

    // ============ Withdrawal Finalization Tests ============

    function test_finalizeGDollarWithdrawal() public {
        // First deposit to lock tokens
        vm.prank(user);
        l1Bridge.depositGDollar(recipient, DEPOSIT_AMOUNT);

        // Simulate L2->L1 message relay (after 7-day challenge)
        l1Messenger.setXDomainMessageSender(address(l2Bridge));

        uint256 recipientBefore = gd.balanceOf(recipient);

        vm.prank(address(l1Messenger));
        l1Bridge.finalizeGDollarWithdrawal(recipient, DEPOSIT_AMOUNT);

        assertEq(gd.balanceOf(recipient), recipientBefore + DEPOSIT_AMOUNT);
        assertEq(l1Bridge.totalGDollarLocked(), 0);
    }

    function test_finalizeGDollarWithdrawal_revertsNotMessenger() public {
        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL1.NotMessenger.selector);
        l1Bridge.finalizeGDollarWithdrawal(recipient, DEPOSIT_AMOUNT);
    }

    function test_finalizeGDollarWithdrawal_revertsNotL2Bridge() public {
        l1Messenger.setXDomainMessageSender(address(0xDEAD));
        vm.prank(address(l1Messenger));
        vm.expectRevert(GoodDollarBridgeL1.NotL2Bridge.selector);
        l1Bridge.finalizeGDollarWithdrawal(recipient, DEPOSIT_AMOUNT);
    }

    function test_finalizeETHWithdrawal() public {
        vm.deal(user, 10 ether);
        vm.prank(user);
        l1Bridge.depositETH{value: 5 ether}(recipient);

        l1Messenger.setXDomainMessageSender(address(l2Bridge));
        uint256 recipientBefore = recipient.balance;

        vm.prank(address(l1Messenger));
        l1Bridge.finalizeETHWithdrawal(recipient, 5 ether);

        assertEq(recipient.balance, recipientBefore + 5 ether);
        assertEq(l1Bridge.totalETHLocked(), 0);
    }

    // ============ L2 Bridge Tests ============

    function test_l2Bridge_constructor() public view {
        assertEq(address(l2Bridge.messenger()), address(l2Messenger));
        assertEq(l2Bridge.admin(), admin);
        assertEq(l2Bridge.l1Bridge(), address(l1Bridge));
    }

    function test_l2Bridge_finalizeDeposit_mintsTokens() public {
        l2Messenger.setXDomainMessageSender(address(l1Bridge));

        vm.prank(address(l2Messenger));
        l2Bridge.finalizeDeposit(address(gd), user, recipient, DEPOSIT_AMOUNT);

        assertEq(l2GD.balanceOf(recipient), DEPOSIT_AMOUNT);
        assertEq(l2Bridge.totalMinted(address(gd)), DEPOSIT_AMOUNT);
    }

    function test_l2Bridge_finalizeDeposit_emitsEvent() public {
        l2Messenger.setXDomainMessageSender(address(l1Bridge));

        vm.prank(address(l2Messenger));
        vm.expectEmit(true, true, true, true);
        emit GoodDollarBridgeL2.DepositFinalized(address(gd), address(l2GD), recipient, DEPOSIT_AMOUNT);
        l2Bridge.finalizeDeposit(address(gd), user, recipient, DEPOSIT_AMOUNT);
    }

    function test_l2Bridge_finalizeDeposit_revertsNotMessenger() public {
        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL2.NotMessenger.selector);
        l2Bridge.finalizeDeposit(address(gd), user, recipient, DEPOSIT_AMOUNT);
    }

    function test_l2Bridge_finalizeDeposit_revertsUnmappedToken() public {
        l2Messenger.setXDomainMessageSender(address(l1Bridge));

        vm.prank(address(l2Messenger));
        vm.expectRevert(GoodDollarBridgeL2.TokenNotMapped.selector);
        l2Bridge.finalizeDeposit(address(0xDEAD), user, recipient, DEPOSIT_AMOUNT);
    }

    function test_l2Bridge_finalizeETHDeposit() public {
        vm.deal(address(l2Bridge), 10 ether);
        l2Messenger.setXDomainMessageSender(address(l1Bridge));

        uint256 recipientBefore = recipient.balance;

        vm.prank(address(l2Messenger));
        l2Bridge.finalizeETHDeposit(user, recipient, 1 ether);

        assertEq(recipient.balance, recipientBefore + 1 ether);
    }

    // ============ L2 Withdrawal Tests ============

    function test_l2Bridge_withdrawGDollar() public {
        // First mint via deposit
        l2Messenger.setXDomainMessageSender(address(l1Bridge));
        vm.prank(address(l2Messenger));
        l2Bridge.finalizeDeposit(address(gd), user, user, DEPOSIT_AMOUNT);

        // User withdraws
        vm.prank(user);
        l2Bridge.withdrawGDollar(address(gd), recipient, DEPOSIT_AMOUNT);

        assertEq(l2GD.balanceOf(user), 0);
        assertEq(l2Bridge.totalMinted(address(gd)), 0);
    }

    function test_l2Bridge_withdrawGDollar_sendsMessage() public {
        l2Messenger.setXDomainMessageSender(address(l1Bridge));
        vm.prank(address(l2Messenger));
        l2Bridge.finalizeDeposit(address(gd), user, user, DEPOSIT_AMOUNT);

        vm.prank(user);
        l2Bridge.withdrawGDollar(address(gd), recipient, DEPOSIT_AMOUNT);

        assertEq(l2Messenger.lastTarget(), address(l1Bridge));
        assertTrue(l2Messenger.lastMessage().length > 0);
    }

    function test_l2Bridge_withdrawGDollar_revertsZeroAmount() public {
        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL2.ZeroAmount.selector);
        l2Bridge.withdrawGDollar(address(gd), recipient, 0);
    }

    function test_l2Bridge_withdrawGDollar_revertsPaused() public {
        vm.prank(admin);
        l2Bridge.setPaused(true);

        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL2.BridgePaused.selector);
        l2Bridge.withdrawGDollar(address(gd), recipient, DEPOSIT_AMOUNT);
    }

    // ============ Full Round-Trip Test ============

    function test_fullRoundTrip_GDollar() public {
        // Step 1: User deposits G$ on L1
        uint256 userL1Before = gd.balanceOf(user);
        vm.prank(user);
        l1Bridge.depositGDollar(user, DEPOSIT_AMOUNT);
        assertEq(gd.balanceOf(user), userL1Before - DEPOSIT_AMOUNT);

        // Step 2: L2 finalizes deposit (messenger relays)
        l2Messenger.setXDomainMessageSender(address(l1Bridge));
        vm.prank(address(l2Messenger));
        l2Bridge.finalizeDeposit(address(gd), user, user, DEPOSIT_AMOUNT);
        assertEq(l2GD.balanceOf(user), DEPOSIT_AMOUNT);

        // Step 3: User withdraws from L2
        vm.prank(user);
        l2Bridge.withdrawGDollar(address(gd), user, DEPOSIT_AMOUNT);
        assertEq(l2GD.balanceOf(user), 0);

        // Step 4: L1 finalizes withdrawal (after 7-day challenge)
        l1Messenger.setXDomainMessageSender(address(l2Bridge));
        vm.prank(address(l1Messenger));
        l1Bridge.finalizeGDollarWithdrawal(user, DEPOSIT_AMOUNT);
        assertEq(gd.balanceOf(user), userL1Before);
    }

    function test_fullRoundTrip_ETH() public {
        vm.deal(user, 10 ether);
        vm.deal(address(l2Bridge), 10 ether);

        // Step 1: Deposit ETH on L1
        vm.prank(user);
        l1Bridge.depositETH{value: 2 ether}(user);

        // Step 2: L2 finalizes ETH deposit (uses pre-funded free ETH)
        l2Messenger.setXDomainMessageSender(address(l1Bridge));
        uint256 userL2Before = user.balance;
        vm.prank(address(l2Messenger));
        l2Bridge.finalizeETHDeposit(user, user, 2 ether);
        assertEq(user.balance, userL2Before + 2 ether);

        // Step 3: User withdraws ETH from L2 -- must send ETH (locks L2 ETH as pending)
        vm.prank(user);
        l2Bridge.withdrawETH{value: 2 ether}(user, 2 ether);
        assertEq(l2Bridge.pendingETHWithdrawalTotal(), 2 ether);

        // Step 4: L1 finalizes ETH withdrawal
        l1Messenger.setXDomainMessageSender(address(l2Bridge));
        uint256 userL1Before = user.balance;
        vm.prank(address(l1Messenger));
        l1Bridge.finalizeETHWithdrawal(user, 2 ether);
        assertEq(user.balance, userL1Before + 2 ether);
    }


    // ============ ETH Withdrawal Security Tests ============

    function test_l2Bridge_withdrawETH_requiresExactValue() public {
        // Attacker has no deposited ETH but tries to drain bridge
        address attacker = address(0xDEAD);
        vm.deal(attacker, 5 ether);
        vm.deal(address(l2Bridge), 10 ether); // bridge has ETH from deposits

        // Must revert: msg.value != amount
        vm.prank(attacker);
        vm.expectRevert(GoodDollarBridgeL2.InsufficientETH.selector);
        l2Bridge.withdrawETH(attacker, 2 ether); // no value sent
    }

    function test_l2Bridge_withdrawETH_revertsValueMismatch() public {
        vm.deal(address(0xABC), 10 ether);
        vm.prank(address(0xABC));
        vm.expectRevert(GoodDollarBridgeL2.InsufficientETH.selector);
        l2Bridge.withdrawETH{value: 1 ether}(address(0xABC), 2 ether); // value != amount
    }

    function test_l2Bridge_withdrawETH_acceptsCorrectValue() public {
        address withdrawer = address(0xABC);
        vm.deal(withdrawer, 5 ether);

        vm.prank(withdrawer);
        l2Bridge.withdrawETH{value: 3 ether}(withdrawer, 3 ether);

        // Cross-chain message was queued
        assertEq(l2Messenger.lastTarget(), address(l1Bridge));
    }

    // ============ ETH Pool Separation Tests (GOO-32 fix) ============

    function test_withdrawETH_reservesPendingTotal() public {
        address withdrawer = address(0xABC);
        vm.deal(withdrawer, 5 ether);

        assertEq(l2Bridge.pendingETHWithdrawalTotal(), 0);

        vm.prank(withdrawer);
        l2Bridge.withdrawETH{value: 3 ether}(withdrawer, 3 ether);

        assertEq(l2Bridge.pendingETHWithdrawalTotal(), 3 ether);
        assertEq(address(l2Bridge).balance, 3 ether);
    }

    function test_finalizeETHDeposit_cannotUseReservedWithdrawalETH() public {
        // Simulate: users have bridged 5 ETH back to L1 (all bridge ETH is reserved)
        address withdrawer = address(0xABC);
        vm.deal(withdrawer, 5 ether);
        vm.prank(withdrawer);
        l2Bridge.withdrawETH{value: 5 ether}(withdrawer, 5 ether);
        assertEq(address(l2Bridge).balance, 5 ether);
        assertEq(l2Bridge.pendingETHWithdrawalTotal(), 5 ether);

        // L1 deposit tries to use reserved withdrawal ETH -- must revert
        l2Messenger.setXDomainMessageSender(address(l1Bridge));
        vm.prank(address(l2Messenger));
        vm.expectRevert(GoodDollarBridgeL2.InsufficientFreeETH.selector);
        l2Bridge.finalizeETHDeposit(user, recipient, 1 ether);
    }

    function test_finalizeETHDeposit_usesFreeETHOnly() public {
        // Bridge has 10 ETH free (pre-funded for deposits) + 3 ETH reserved (pending withdrawal)
        vm.deal(address(l2Bridge), 10 ether);

        address withdrawer = address(0xABC);
        vm.deal(withdrawer, 3 ether);
        vm.prank(withdrawer);
        l2Bridge.withdrawETH{value: 3 ether}(withdrawer, 3 ether);

        // Total bridge balance: 13 ETH, reserved: 3 ETH, free: 10 ETH
        assertEq(address(l2Bridge).balance, 13 ether);
        assertEq(l2Bridge.pendingETHWithdrawalTotal(), 3 ether);

        // Deposit of 10 ETH (exactly the free amount) should succeed
        l2Messenger.setXDomainMessageSender(address(l1Bridge));
        uint256 recipientBefore = recipient.balance;
        vm.prank(address(l2Messenger));
        l2Bridge.finalizeETHDeposit(user, recipient, 10 ether);
        assertEq(recipient.balance, recipientBefore + 10 ether);

        // Reserved withdrawal ETH is still intact
        assertEq(l2Bridge.pendingETHWithdrawalTotal(), 3 ether);
        assertEq(address(l2Bridge).balance, 3 ether);
    }

    function test_finalizeETHDeposit_revertsIfExceedsFreeETH() public {
        // Bridge starts with 2 ETH from previous L1->L2 deposits.
        // withdrawETH{value:8} adds 8 more ETH from the withdrawer, giving
        // bridge 10 ETH total with 8 pending — only 2 ETH free.
        vm.deal(address(l2Bridge), 2 ether);

        address withdrawer = address(0xABC);
        vm.deal(withdrawer, 8 ether);
        vm.prank(withdrawer);
        l2Bridge.withdrawETH{value: 8 ether}(withdrawer, 8 ether);

        // Attempt to deposit 5 ETH when only 2 ETH is free -- must revert
        l2Messenger.setXDomainMessageSender(address(l1Bridge));
        vm.prank(address(l2Messenger));
        vm.expectRevert(GoodDollarBridgeL2.InsufficientFreeETH.selector);
        l2Bridge.finalizeETHDeposit(user, recipient, 5 ether);
    }

    function test_withdrawETH_multipleUsersAccumulate() public {
        vm.deal(user, 5 ether);
        vm.deal(recipient, 3 ether);

        vm.prank(user);
        l2Bridge.withdrawETH{value: 5 ether}(user, 5 ether);
        vm.prank(recipient);
        l2Bridge.withdrawETH{value: 3 ether}(recipient, 3 ether);

        assertEq(l2Bridge.pendingETHWithdrawalTotal(), 8 ether);
        assertEq(address(l2Bridge).balance, 8 ether);
    }

    // ============ Admin Tests ============

    function test_l1Bridge_pause() public {
        vm.prank(admin);
        l1Bridge.setPaused(true);
        assertEq(l1Bridge.paused(), true);
    }

    function test_l1Bridge_pause_revertsNotAdmin() public {
        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL1.NotAdmin.selector);
        l1Bridge.setPaused(true);
    }

    function test_l2Bridge_mapToken() public {
        address newL1 = address(0x1234);
        address newL2 = address(0x5678);

        vm.prank(admin);
        l2Bridge.mapToken(newL1, newL2);

        assertEq(l2Bridge.l1ToL2Token(newL1), newL2);
    }

    function test_l2Bridge_mapToken_revertsNotAdmin() public {
        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL2.NotAdmin.selector);
        l2Bridge.mapToken(address(0x1), address(0x2));
    }

    // ============ Multiple Deposits ============

    function test_multipleDeposits_accumulate() public {
        vm.startPrank(user);
        l1Bridge.depositGDollar(recipient, 1000e18);
        l1Bridge.depositGDollar(recipient, 2000e18);
        l1Bridge.depositGDollar(recipient, 3000e18);
        vm.stopPrank();

        assertEq(l1Bridge.totalGDollarLocked(), 6000e18);
        assertEq(l1Bridge.deposits(address(gd), user), 6000e18);
    }

    // ============ Gas Benchmarks ============

    function test_gasBenchmark_depositGDollar() public {
        vm.prank(user);
        uint256 gasBefore = gasleft();
        l1Bridge.depositGDollar(recipient, DEPOSIT_AMOUNT);
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("depositGDollar gas", gasUsed);
        assertLt(gasUsed, 350_000);
    }

    function test_gasBenchmark_depositETH() public {
        vm.deal(user, 10 ether);
        vm.prank(user);
        uint256 gasBefore = gasleft();
        l1Bridge.depositETH{value: 1 ether}(recipient);
        uint256 gasUsed = gasBefore - gasleft();
        emit log_named_uint("depositETH gas", gasUsed);
        assertLt(gasUsed, 250_000);
    }

    // ============ PeerNotConfigured Guard Tests ============

    function test_l1Bridge_depositGDollar_revertsIfPeerNotSet() public {
        GoodDollarBridgeL1 freshL1 = new GoodDollarBridgeL1(
            address(l1Messenger), address(gd), address(usdc), admin
        );
        vm.prank(admin);
        gd.transfer(user, 1000e18);
        vm.prank(user);
        gd.approve(address(freshL1), type(uint256).max);
        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL1.PeerNotConfigured.selector);
        freshL1.depositGDollar(recipient, 100e18);
    }

    function test_l1Bridge_depositETH_revertsIfPeerNotSet() public {
        GoodDollarBridgeL1 freshL1 = new GoodDollarBridgeL1(
            address(l1Messenger), address(gd), address(usdc), admin
        );
        vm.deal(user, 1 ether);
        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL1.PeerNotConfigured.selector);
        freshL1.depositETH{value: 1 ether}(recipient);
    }

    function test_l2Bridge_withdrawGDollar_revertsIfPeerNotSet() public {
        GoodDollarBridgeL2 freshL2 = new GoodDollarBridgeL2(address(l2Messenger), admin);
        MockL2Token freshToken = new MockL2Token("G$L2", "G$", address(freshL2));
        vm.prank(admin);
        freshL2.mapToken(address(gd), address(freshToken));
        vm.prank(address(freshL2));
        freshToken.mint(user, 100e18);
        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL2.PeerNotConfigured.selector);
        freshL2.withdrawGDollar(address(gd), recipient, 100e18);
    }

    function test_l2Bridge_withdrawETH_revertsIfPeerNotSet() public {
        GoodDollarBridgeL2 freshL2 = new GoodDollarBridgeL2(address(l2Messenger), admin);
        vm.deal(user, 1 ether);
        vm.prank(user);
        vm.expectRevert(GoodDollarBridgeL2.PeerNotConfigured.selector);
        freshL2.withdrawETH{value: 1 ether}(recipient, 1 ether);
    }
}
