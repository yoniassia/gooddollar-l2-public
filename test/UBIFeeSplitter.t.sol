// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/UBIFeeSplitter.sol";
import "../src/GoodDollarToken.sol";

/// @title UBIFeeSplitter Test Suite
/// @notice Comprehensive coverage for splitFee, splitFeeToken, releaseToUBI,
///         admin governance, and ETH withdrawal.
contract UBIFeeSplitterTest is Test {
    GoodDollarToken token;
    UBIFeeSplitter splitter;

    // Minimal ERC-20 mock for splitFeeToken tests (gUSD / non-G$ tokens)
    MockERC20 gUSD;

    address admin    = makeAddr("admin");
    address oracle   = makeAddr("oracle");
    address treasury = makeAddr("treasury");
    address dapp     = makeAddr("dapp");
    address ubiClaim = makeAddr("ubiClaim");
    address ubiRecip = makeAddr("ubiRecipient");
    address alice    = makeAddr("alice");

    function setUp() public {
        vm.startPrank(admin);
        token   = new GoodDollarToken(admin, oracle, 0);
        splitter = new UBIFeeSplitter(address(token), treasury, admin);
        gUSD    = new MockERC20("GoodUSD", "gUSD");
        vm.stopPrank();

        // Give alice some G$ and non-G$ tokens for fee tests
        vm.prank(admin);
        token.setMinter(address(this), true);
        token.mint(alice, 10_000 ether);
        gUSD.mint(alice, 10_000 ether);
    }

    // ─── splitFee (G$) ────────────────────────────────────────────────────────

    function test_splitFee_RoutesCorrectly() public {
        vm.startPrank(alice);
        token.approve(address(splitter), 1000 ether);
        (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) =
            splitter.splitFee(1000 ether, dapp);
        vm.stopPrank();

        // ubiBPS=3333 → 333.3 G$, protocolBPS=1667 → 166.7 G$, dApp=~500 G$
        assertEq(ubiShare, (1000 ether * 3333) / 10000);
        assertEq(protocolShare, (1000 ether * 1667) / 10000);
        assertEq(dAppShare, 1000 ether - ubiShare - protocolShare);
        assertEq(token.balanceOf(dapp), dAppShare);
        assertEq(token.balanceOf(treasury), protocolShare);
        assertEq(splitter.totalFeesCollected(), 1000 ether);
        assertEq(splitter.totalUBIFunded(), ubiShare);
    }

    function test_splitFee_ZeroFee_Reverts() public {
        vm.prank(alice);
        token.approve(address(splitter), 1000 ether);
        vm.expectRevert("Zero fee");
        splitter.splitFee(0, dapp);
    }

    function test_splitFee_EmitsEvent() public {
        vm.startPrank(alice);
        token.approve(address(splitter), 300 ether);
        vm.expectEmit(true, false, false, false);
        emit UBIFeeSplitter.FeeSplit(alice, 300 ether, 0, 0, 0);
        splitter.splitFee(300 ether, dapp);
        vm.stopPrank();
    }

    // ─── splitFeeToken (ERC-20 other than G$) ─────────────────────────────────

    function test_splitFeeToken_RequiresUBIRecipientSet() public {
        vm.startPrank(alice);
        gUSD.approve(address(splitter), 100 ether);
        // ubiRecipient defaults to treasury (not zero) from constructor
        // so this should succeed — let's verify the default is treasury
        splitter.splitFeeToken(100 ether, dapp, address(gUSD));
        vm.stopPrank();
        assertGt(gUSD.balanceOf(treasury), 0);
    }

    function test_splitFeeToken_RoutesCorrectly() public {
        // Set a specific ubiRecipient
        vm.prank(admin);
        splitter.setUBIRecipient(ubiRecip);

        vm.startPrank(alice);
        gUSD.approve(address(splitter), 1000 ether);
        (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) =
            splitter.splitFeeToken(1000 ether, dapp, address(gUSD));
        vm.stopPrank();

        assertEq(ubiShare, (1000 ether * 3333) / 10000);
        assertEq(protocolShare, (1000 ether * 1667) / 10000);
        assertEq(dAppShare, 1000 ether - ubiShare - protocolShare);
        assertEq(gUSD.balanceOf(ubiRecip), ubiShare);
        assertEq(gUSD.balanceOf(treasury), protocolShare);
        assertEq(gUSD.balanceOf(dapp), dAppShare);
        // splitFeeToken does NOT update totalUBIFunded, only totalFeesCollected
        assertEq(splitter.totalFeesCollected(), 1000 ether);
    }

    function test_splitFeeToken_ZeroFee_Reverts() public {
        vm.prank(alice);
        gUSD.approve(address(splitter), 100 ether);
        vm.expectRevert("Zero fee");
        splitter.splitFeeToken(0, dapp, address(gUSD));
    }

    // ─── releaseToUBI ─────────────────────────────────────────────────────────

    function test_releaseToUBI_OnlyUBIClaimContract() public {
        vm.prank(alice);
        vm.expectRevert("Not UBIClaim");
        splitter.releaseToUBI(alice, 100 ether);
    }

    function test_releaseToUBI_HappyPath() public {
        // Set ubiClaimContract
        vm.prank(admin);
        splitter.setUBIClaimContract(ubiClaim);

        // Fund splitter with G$ (simulate fee accumulation)
        token.mint(address(splitter), 500 ether);

        uint256 recipBefore = token.balanceOf(alice);
        vm.prank(ubiClaim);
        splitter.releaseToUBI(alice, 200 ether);

        assertEq(token.balanceOf(alice), recipBefore + 200 ether);
        assertEq(token.balanceOf(address(splitter)), 300 ether);
    }

    function test_releaseToUBI_InsufficientBalance_Reverts() public {
        vm.prank(admin);
        splitter.setUBIClaimContract(ubiClaim);

        vm.prank(ubiClaim);
        vm.expectRevert("insufficient balance");
        splitter.releaseToUBI(alice, 1 ether);
    }

    function test_claimableBalance_ReflectsGDBalance() public {
        assertEq(splitter.claimableBalance(), 0);
        token.mint(address(splitter), 777 ether);
        assertEq(splitter.claimableBalance(), 777 ether);
    }

    // ─── registerDApp ─────────────────────────────────────────────────────────

    function test_registerDApp_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert("Not admin");
        splitter.registerDApp(dapp, "MyDApp");
    }

    function test_registerDApp_HappyPath() public {
        assertFalse(splitter.registeredDApps(dapp));
        vm.prank(admin);
        splitter.registerDApp(dapp, "GoodLend");
        assertTrue(splitter.registeredDApps(dapp));
        assertEq(splitter.dAppCount(), 1);
    }

    function test_registerDApp_Idempotent() public {
        vm.startPrank(admin);
        splitter.registerDApp(dapp, "GoodLend");
        splitter.registerDApp(dapp, "GoodLend again"); // second call ignored
        vm.stopPrank();
        assertEq(splitter.dAppCount(), 1); // still 1
    }

    function test_dAppCount_StartsZero() public view {
        assertEq(splitter.dAppCount(), 0);
    }

    // ─── Governance ───────────────────────────────────────────────────────────

    function test_setFeeSplit_HappyPath() public {
        vm.prank(admin);
        splitter.setFeeSplit(5000, 1000);
        assertEq(splitter.ubiBPS(), 5000);
        assertEq(splitter.protocolBPS(), 1000);
    }

    function test_setFeeSplit_ExceedsMax_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("Exceeds 100%");
        splitter.setFeeSplit(6000, 5000);
    }

    function test_setFeeSplit_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert("Not admin");
        splitter.setFeeSplit(5000, 1000);
    }

    function test_setTreasury_UpdatesTreasury() public {
        address newTreasury = makeAddr("newTreasury");
        vm.prank(admin);
        splitter.setTreasury(newTreasury);
        assertEq(splitter.protocolTreasury(), newTreasury);
    }

    function test_setTreasury_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert("Not admin");
        splitter.setTreasury(alice);
    }

    function test_setUBIRecipient_ZeroAddress_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("zero address");
        splitter.setUBIRecipient(address(0));
    }

    function test_setUBIRecipient_HappyPath() public {
        vm.prank(admin);
        splitter.setUBIRecipient(ubiRecip);
        assertEq(splitter.ubiRecipient(), ubiRecip);
    }

    function test_setUBIClaimContract_ZeroAddress_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("zero address");
        splitter.setUBIClaimContract(address(0));
    }

    function test_setUBIClaimContract_HappyPath() public {
        vm.prank(admin);
        splitter.setUBIClaimContract(ubiClaim);
        assertEq(splitter.ubiClaimContract(), ubiClaim);
    }

    function test_setGoodDollar_UpdatesAddress() public {
        vm.startPrank(admin);
        GoodDollarToken newToken = new GoodDollarToken(admin, oracle, 0);
        splitter.setGoodDollar(address(newToken));
        vm.stopPrank();
        assertEq(address(splitter.goodDollar()), address(newToken));
    }

    function test_setGoodDollar_ZeroAddress_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("zero address");
        splitter.setGoodDollar(address(0));
    }

    function test_setGoodDollar_OnlyAdmin() public {
        vm.prank(alice);
        vm.expectRevert("Not admin");
        splitter.setGoodDollar(address(token));
    }

    function test_setGoodDollar_SplitFeeUsesNewToken() public {
        vm.startPrank(admin);
        GoodDollarToken newToken = new GoodDollarToken(admin, oracle, 0);
        splitter.setGoodDollar(address(newToken));
        newToken.setMinter(address(this), true);
        vm.stopPrank();

        // Mint new token to alice and verify splitFee works with updated address
        newToken.mint(alice, 1000 ether);
        vm.startPrank(alice);
        newToken.approve(address(splitter), 1000 ether);
        (uint256 ubiShare,,) = splitter.splitFee(1000 ether, dapp);
        vm.stopPrank();

        assertEq(ubiShare, (1000 ether * 3333) / 10000);
    }

    // ─── ETH receive + withdrawETH ─────────────────────────────────────────────

    function test_receiveETH() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool sent,) = address(splitter).call{value: 1 ether}("");
        assertTrue(sent);
        assertEq(address(splitter).balance, 1 ether);
    }

    function test_withdrawETH_HappyPath() public {
        vm.deal(address(splitter), 2 ether);
        uint256 treasuryBefore = treasury.balance;
        vm.prank(admin);
        splitter.withdrawETH();
        assertEq(address(splitter).balance, 0);
        assertEq(treasury.balance, treasuryBefore + 2 ether);
    }

    function test_withdrawETH_NoBalance_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("no ETH");
        splitter.withdrawETH();
    }

    function test_withdrawETH_OnlyAdmin() public {
        vm.deal(address(splitter), 1 ether);
        vm.prank(alice);
        vm.expectRevert("Not admin");
        splitter.withdrawETH();
    }
}

/// @dev Minimal ERC-20 mock for non-G$ token fee tests.
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        require(balanceOf[from] >= amount, "insufficient");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
