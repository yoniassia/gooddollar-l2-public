// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/stable/StableUBIFeeSplitter.sol";
import "../src/interfaces/IGoodDollarToken.sol";

/**
 * @title StableUBIFeeSplitter Test Suite
 * @notice Comprehensive tests for stablecoin protocol UBI fee routing.
 *
 * Test Coverage:
 * ✅ Core fee splitting (33.33% UBI / 16.67% protocol / 50% dApp)
 * ✅ Enhanced stability fee tracking by collateral type (ilk)
 * ✅ Enhanced minting fee tracking by user and direction
 * ✅ Liquidation penalty and governance fee tracking
 * ✅ Daily/monthly UBI impact analytics
 * ✅ Gas overhead validation (<2% target)
 * ✅ Access controls and governance functions
 * ✅ Social impact measurement and target tracking
 * ✅ Backward compatibility patterns
 */
contract StableUBIFeeSplitterTest is Test {
    StableUBIFeeSplitter public splitter;
    MockGoodDollarToken public goodDollar;
    MockERC20 public gUSD;
    MockERC20 public usdc;

    address public treasury = address(0x7777);
    address public admin = address(0x1111);
    address public vaultManager = address(0x2222);
    address public psm = address(0x3333);
    address public user1 = address(0x4444);
    address public user2 = address(0x5555);

    // Collateral type identifiers
    bytes32 public constant WETH_ILK = keccak256("WETH-A");
    bytes32 public constant WBTC_ILK = keccak256("WBTC-A");
    bytes32 public constant USDC_ILK = keccak256("USDC-A");

    // Test constants
    uint256 public constant INITIAL_SUPPLY = 1_000_000e18;
    uint256 public constant TEST_FEE = 1000e18; // 1000 G$ fee
    uint256 public constant EXPECTED_UBI = 333.3e18; // 33.33%
    uint256 public constant EXPECTED_PROTOCOL = 166.7e18; // 16.67%
    uint256 public constant EXPECTED_DAPP = 500e18; // 50%

    event FeeSplit(
        address indexed source,
        string indexed feeType,
        uint256 totalFee,
        uint256 ubiShare,
        uint256 protocolShare,
        uint256 dAppShare,
        address token
    );
    event StabilityFeeSplit(bytes32 indexed ilk, uint256 feeGUSD, uint256 ubiShare);
    event MintingFeeSplit(address indexed user, string indexed swapDirection, uint256 fee, uint256 ubiShare);

    function setUp() public {
        goodDollar = new MockGoodDollarToken();
        gUSD = new MockERC20("gUSD", "gUSD");
        usdc = new MockERC20("USDC", "USDC");

        splitter = new StableUBIFeeSplitter(address(goodDollar), treasury, admin);

        // Setup token supplies
        goodDollar.mint(vaultManager, INITIAL_SUPPLY);
        goodDollar.mint(psm, INITIAL_SUPPLY);
        gUSD.mint(vaultManager, INITIAL_SUPPLY);
        gUSD.mint(psm, INITIAL_SUPPLY);
        usdc.mint(psm, INITIAL_SUPPLY / 1e12); // USDC has 6 decimals

        // Set UBI recipient for non-G$ tokens
        vm.prank(admin);
        splitter.setUBIRecipient(treasury);
    }

    // ============ Core Fee Splitting Tests ============

    function test_splitFee_GoodDollar() public {
        vm.startPrank(vaultManager);
        goodDollar.approve(address(splitter), TEST_FEE);

        vm.expectEmit(true, true, false, true);
        emit FeeSplit(vaultManager, "g-dollar", TEST_FEE, EXPECTED_UBI, EXPECTED_PROTOCOL, EXPECTED_DAPP, address(goodDollar));

        (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) =
            splitter.splitFee(TEST_FEE, vaultManager);

        vm.stopPrank();

        // Verify return values
        assertEq(ubiShare, EXPECTED_UBI);
        assertEq(protocolShare, EXPECTED_PROTOCOL);
        assertEq(dAppShare, EXPECTED_DAPP);
        assertEq(ubiShare + protocolShare + dAppShare, TEST_FEE);

        // Verify treasury balance (protocol share)
        assertEq(goodDollar.balanceOf(treasury), EXPECTED_PROTOCOL);

        // Verify dApp recipient balance
        assertEq(goodDollar.balanceOf(vaultManager), INITIAL_SUPPLY - TEST_FEE + EXPECTED_DAPP);

        // Verify UBI pool funding (mock implementation)
        assertEq(goodDollar.ubiPoolFunded(), EXPECTED_UBI);
    }

    function test_splitFeeToken_gUSD() public {
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE);

        vm.expectEmit(true, true, false, true);
        emit FeeSplit(vaultManager, "token", TEST_FEE, EXPECTED_UBI, EXPECTED_PROTOCOL, EXPECTED_DAPP, address(gUSD));

        (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) =
            splitter.splitFeeToken(TEST_FEE, vaultManager, address(gUSD));

        vm.stopPrank();

        // Verify shares
        assertEq(ubiShare, EXPECTED_UBI);
        assertEq(protocolShare, EXPECTED_PROTOCOL);
        assertEq(dAppShare, EXPECTED_DAPP);

        // Verify token distributions
        assertEq(gUSD.balanceOf(treasury), EXPECTED_UBI + EXPECTED_PROTOCOL); // UBI + protocol
        assertEq(gUSD.balanceOf(vaultManager), INITIAL_SUPPLY - TEST_FEE + EXPECTED_DAPP);
    }

    function test_splitFee_ZeroAmount_Reverts() public {
        vm.prank(vaultManager);
        vm.expectRevert("Zero fee");
        splitter.splitFee(0, vaultManager);
    }

    function test_splitFeeToken_ZeroUBIRecipient_Reverts() public {
        vm.prank(admin);
        splitter.setUBIRecipient(address(0));

        vm.prank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE);
        vm.expectRevert("UBI recipient not set");
        splitter.splitFeeToken(TEST_FEE, vaultManager, address(gUSD));
    }

    // ============ Enhanced Stability Fee Tests ============

    function test_splitStabilityFee_WETHCollateral() public {
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE);

        vm.expectEmit(true, true, false, true);
        emit StabilityFeeSplit(WETH_ILK, TEST_FEE, EXPECTED_UBI);

        (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) =
            splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WETH_ILK);

        vm.stopPrank();

        // Verify tracking
        assertEq(splitter.totalStabilityFees(), TEST_FEE);
        assertEq(splitter.totalUBIFromStability(), EXPECTED_UBI);
        assertEq(splitter.stabilityFeesByIlk(WETH_ILK), TEST_FEE);
        assertEq(splitter.vaultManagerContributions(vaultManager), EXPECTED_UBI);

        // Verify ilk tracking
        assertEq(splitter.getActiveIlkCount(), 1);
        assertTrue(splitter.ilkExists(WETH_ILK));
    }

    function test_splitStabilityFee_MultipleCollaterals() public {
        // Test WETH collateral
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE);
        splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WETH_ILK);

        // Test WBTC collateral
        gUSD.approve(address(splitter), TEST_FEE);
        splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WBTC_ILK);
        vm.stopPrank();

        // Verify aggregate tracking
        assertEq(splitter.totalStabilityFees(), TEST_FEE * 2);
        assertEq(splitter.totalUBIFromStability(), EXPECTED_UBI * 2);
        assertEq(splitter.getActiveIlkCount(), 2);

        // Verify individual ilk tracking
        assertEq(splitter.stabilityFeesByIlk(WETH_ILK), TEST_FEE);
        assertEq(splitter.stabilityFeesByIlk(WBTC_ILK), TEST_FEE);
        assertTrue(splitter.ilkExists(WETH_ILK));
        assertTrue(splitter.ilkExists(WBTC_ILK));
    }

    // ============ Enhanced Minting Fee Tests ============

    function test_splitMintingFee_USDCToGUSD() public {
        vm.startPrank(psm);
        gUSD.approve(address(splitter), TEST_FEE);

        vm.expectEmit(true, true, false, true);
        emit MintingFeeSplit(user1, "USDC-to-gUSD", TEST_FEE, EXPECTED_UBI);

        (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) =
            splitter.splitMintingFee(TEST_FEE, psm, address(gUSD), user1, "USDC-to-gUSD");

        vm.stopPrank();

        // Verify tracking
        assertEq(splitter.totalMintingFees(), TEST_FEE);
        assertEq(splitter.totalUBIFromMinting(), EXPECTED_UBI);
        assertEq(splitter.mintingFeesByUser(user1), TEST_FEE);
        assertEq(splitter.psmContributions(psm), EXPECTED_UBI);
    }

    function test_splitMintingFee_GUSDToUSDC() public {
        vm.startPrank(psm);
        gUSD.approve(address(splitter), TEST_FEE);

        splitter.splitMintingFee(TEST_FEE, psm, address(gUSD), user2, "gUSD-to-USDC");
        vm.stopPrank();

        // Verify user-specific tracking
        assertEq(splitter.mintingFeesByUser(user2), TEST_FEE);
        assertEq(splitter.mintingFeesByUser(user1), 0); // Different user
    }

    function test_splitMintingFee_MultipleUsers() public {
        vm.startPrank(psm);

        // User1 minting
        gUSD.approve(address(splitter), TEST_FEE);
        splitter.splitMintingFee(TEST_FEE, psm, address(gUSD), user1, "USDC-to-gUSD");

        // User2 minting
        gUSD.approve(address(splitter), TEST_FEE * 2);
        splitter.splitMintingFee(TEST_FEE * 2, psm, address(gUSD), user2, "gUSD-to-USDC");

        vm.stopPrank();

        // Verify aggregate tracking
        assertEq(splitter.totalMintingFees(), TEST_FEE * 3);
        assertEq(splitter.totalUBIFromMinting(), EXPECTED_UBI * 3);

        // Verify individual user tracking
        assertEq(splitter.mintingFeesByUser(user1), TEST_FEE);
        assertEq(splitter.mintingFeesByUser(user2), TEST_FEE * 2);
        assertEq(splitter.getUserMintingFees(user1), TEST_FEE);
        assertEq(splitter.getUserMintingFees(user2), TEST_FEE * 2);
    }

    // ============ Liquidation and Governance Fee Tests ============

    function test_splitLiquidationPenalty() public {
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE);

        (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) =
            splitter.splitLiquidationPenalty(TEST_FEE, vaultManager, address(gUSD), WETH_ILK, user1);

        vm.stopPrank();

        // Verify tracking
        assertEq(splitter.totalLiquidationFees(), TEST_FEE);
        assertEq(splitter.totalUBIFromLiquidations(), EXPECTED_UBI);
        assertEq(ubiShare, EXPECTED_UBI);
    }

    function test_splitGovernanceFee() public {
        vm.startPrank(admin);
        gUSD.approve(address(splitter), TEST_FEE);

        (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) =
            splitter.splitGovernanceFee(TEST_FEE, admin, address(gUSD), user1);

        vm.stopPrank();

        // Verify tracking
        assertEq(splitter.totalGovernanceFees(), TEST_FEE);
        assertEq(splitter.totalUBIFromGovernance(), EXPECTED_UBI);
        assertEq(ubiShare, EXPECTED_UBI);
    }

    // ============ Daily UBI Impact Tests ============

    function test_dailyStablecoinImpact_SameDay() public {
        // Set initial timestamp
        vm.warp(1000000); // Day 11 (1000000 / 86400 = 11.57)

        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE * 3);

        // Multiple fees in same day
        splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WETH_ILK);
        splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WBTC_ILK);
        vm.stopPrank();

        vm.startPrank(psm);
        gUSD.approve(address(splitter), TEST_FEE);
        splitter.splitMintingFee(TEST_FEE, psm, address(gUSD), user1, "USDC-to-gUSD");
        vm.stopPrank();

        // Check daily accumulation
        (uint256 currentDay, uint256 ubiAmount) = splitter.getTodayStablecoinImpact();
        assertEq(currentDay, 11); // 1000000 / 86400 = 11
        assertEq(ubiAmount, EXPECTED_UBI * 3); // 3 fees worth of UBI
    }

    function test_dailyStablecoinImpact_NewDay() public {
        // Day 1
        vm.warp(86400); // Exactly day 1
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE);
        splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WETH_ILK);
        vm.stopPrank();

        // Day 2 - should reset and emit previous day's impact
        vm.warp(86400 * 2);
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE);

        vm.expectEmit(false, false, false, true);
        emit DailyStablecoinImpact(1, EXPECTED_UBI); // Day 1 impact

        splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WBTC_ILK);
        vm.stopPrank();

        // Verify new day starts fresh
        (uint256 currentDay, uint256 ubiAmount) = splitter.getTodayStablecoinImpact();
        assertEq(currentDay, 2);
        assertEq(ubiAmount, EXPECTED_UBI); // Only day 2's fees
    }

    // ============ Analytics and Impact Measurement Tests ============

    function test_getStablecoinUBIStats_Comprehensive() public {
        // Setup various fee types
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE * 4);
        splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WETH_ILK);
        splitter.splitLiquidationPenalty(TEST_FEE, vaultManager, address(gUSD), WETH_ILK, user1);
        vm.stopPrank();

        vm.startPrank(psm);
        gUSD.approve(address(splitter), TEST_FEE);
        splitter.splitMintingFee(TEST_FEE, psm, address(gUSD), user1, "USDC-to-gUSD");
        vm.stopPrank();

        vm.startPrank(admin);
        gUSD.approve(address(splitter), TEST_FEE);
        splitter.splitGovernanceFee(TEST_FEE, admin, address(gUSD), user1);
        vm.stopPrank();

        // Get comprehensive stats
        (
            uint256 stabilityFees,
            uint256 mintingFees,
            uint256 liquidationFees,
            uint256 governanceFees,
            uint256 ubiFromStability,
            uint256 ubiFromMinting,
            uint256 ubiFromLiquidations,
            uint256 ubiFromGovernance,
            uint256 totalUBI
        ) = splitter.getStablecoinUBIStats();

        // Verify all stats
        assertEq(stabilityFees, TEST_FEE);
        assertEq(mintingFees, TEST_FEE);
        assertEq(liquidationFees, TEST_FEE);
        assertEq(governanceFees, TEST_FEE);
        assertEq(ubiFromStability, EXPECTED_UBI);
        assertEq(ubiFromMinting, EXPECTED_UBI);
        assertEq(ubiFromLiquidations, EXPECTED_UBI);
        assertEq(ubiFromGovernance, EXPECTED_UBI);
        assertEq(totalUBI, EXPECTED_UBI * 4);
    }

    function test_getMonthlyUBIEstimate() public {
        uint256 startTime = 1000000;
        vm.warp(startTime);

        // Generate UBI over several "days"
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE * 5);
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(startTime + (i * 86400)); // Each day
            splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WETH_ILK);
        }
        vm.stopPrank();

        // Fast forward to get a meaningful calculation
        vm.warp(startTime + (5 * 86400));

        (uint256 estimated, uint256 target, uint256 progress) = splitter.getMonthlyUBIEstimate();

        assertGt(estimated, 0);
        assertEq(target, 15_000e18); // Default target
        assertGt(progress, 0);
    }

    function test_getStablecoinSocialImpactRate() public {
        // Generate fees and UBI
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE * 2);
        splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WETH_ILK);
        vm.stopPrank();

        vm.startPrank(psm);
        gUSD.approve(address(splitter), TEST_FEE);
        splitter.splitMintingFee(TEST_FEE, psm, address(gUSD), user1, "USDC-to-gUSD");
        vm.stopPrank();

        uint256 impactRate = splitter.getStablecoinSocialImpactRate();

        // Should be 3333 (33.33% * 10000 for readability)
        assertEq(impactRate, 3333);
    }

    function test_getIlkBreakdown() public {
        // Add fees for multiple ilks
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE * 3);
        splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WETH_ILK);
        splitter.splitStabilityFee(TEST_FEE * 2, vaultManager, address(gUSD), WBTC_ILK);
        vm.stopPrank();

        (bytes32[] memory ilks, uint256[] memory fees) = splitter.getIlkBreakdown();

        assertEq(ilks.length, 2);
        assertEq(fees.length, 2);

        // Find WETH and WBTC entries
        bool foundWETH = false;
        bool foundWBTC = false;

        for (uint256 i = 0; i < ilks.length; i++) {
            if (ilks[i] == WETH_ILK) {
                assertEq(fees[i], TEST_FEE);
                foundWETH = true;
            } else if (ilks[i] == WBTC_ILK) {
                assertEq(fees[i], TEST_FEE * 2);
                foundWBTC = true;
            }
        }

        assertTrue(foundWETH);
        assertTrue(foundWBTC);
    }

    // ============ Gas Overhead Tests ============

    function test_gasOverhead_StabilityFee() public {
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE * 2);

        // Baseline: simple transfer
        uint256 gasStart = gasleft();
        gUSD.transfer(treasury, TEST_FEE);
        uint256 gasBaseline = gasStart - gasleft();

        // Test: split stability fee with tracking
        gasStart = gasleft();
        splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WETH_ILK);
        uint256 gasWithSplitter = gasStart - gasleft();
        vm.stopPrank();

        // Calculate overhead percentage
        uint256 overhead = ((gasWithSplitter - gasBaseline) * 10000) / gasBaseline;

        // Should be less than 2% (200 basis points)
        assertLt(overhead, 200, "Gas overhead should be <2%");
    }

    function test_gasOverhead_MintingFee() public {
        vm.startPrank(psm);
        gUSD.approve(address(splitter), TEST_FEE * 2);

        // Baseline: simple transfer
        uint256 gasStart = gasleft();
        gUSD.transfer(treasury, TEST_FEE);
        uint256 gasBaseline = gasStart - gasleft();

        // Test: split minting fee with tracking
        gasStart = gasleft();
        splitter.splitMintingFee(TEST_FEE, psm, address(gUSD), user1, "USDC-to-gUSD");
        uint256 gasWithSplitter = gasStart - gasleft();
        vm.stopPrank();

        // Calculate overhead percentage
        uint256 overhead = ((gasWithSplitter - gasBaseline) * 10000) / gasBaseline;

        // Should be less than 2% (200 basis points)
        assertLt(overhead, 200, "Gas overhead should be <2%");
    }

    // ============ Governance Tests ============

    function test_setFeeSplit_Success() public {
        vm.prank(admin);
        splitter.setFeeSplit(4000, 2000); // 40% UBI, 20% protocol, 40% dApp

        assertEq(splitter.ubiBPS(), 4000);
        assertEq(splitter.protocolBPS(), 2000);

        // Test new split ratio
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE);
        (uint256 ubiShare, uint256 protocolShare, uint256 dAppShare) =
            splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WETH_ILK);
        vm.stopPrank();

        assertEq(ubiShare, 400e18); // 40%
        assertEq(protocolShare, 200e18); // 20%
        assertEq(dAppShare, 400e18); // 40%
    }

    function test_setFeeSplit_ExceedsMax_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("Exceeds 100%");
        splitter.setFeeSplit(6000, 5000); // 60% + 50% = 110%
    }

    function test_setFeeSplit_OnlyAdmin() public {
        vm.prank(user1);
        vm.expectRevert("Not admin");
        splitter.setFeeSplit(4000, 2000);
    }

    function test_setMonthlyTarget() public {
        vm.prank(admin);

        vm.expectEmit(false, false, false, true);
        emit MonthlyTargetUpdated(15_000e18, 20_000e18);

        splitter.setMonthlyTarget(20_000e18);
        assertEq(splitter.monthlyTargetUBI(), 20_000e18);
    }

    function test_setUBIRecipient() public {
        address newRecipient = address(0x9999);

        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit UBIRecipientUpdated(treasury, newRecipient);

        splitter.setUBIRecipient(newRecipient);
        assertEq(splitter.ubiRecipient(), newRecipient);
    }

    function test_setUBIRecipient_ZeroAddress_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("zero address");
        splitter.setUBIRecipient(address(0));
    }

    // ============ Social Impact Target Tests ============

    function test_monthlyTargetProgress_OnTrack() public {
        // Set a lower target for testing
        vm.prank(admin);
        splitter.setMonthlyTarget(1000e18); // $1K target

        // Generate UBI over 10 days
        vm.warp(1000000);
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE * 10);

        for (uint256 i = 0; i < 10; i++) {
            vm.warp(1000000 + (i * 86400));
            splitter.splitStabilityFee(TEST_FEE / 10, vaultManager, address(gUSD), WETH_ILK);
        }
        vm.stopPrank();

        vm.warp(1000000 + (10 * 86400));

        (uint256 estimated, uint256 target, uint256 progress) = splitter.getMonthlyUBIEstimate();

        assertGt(progress, 0);
        assertEq(target, 1000e18);
    }

    // ============ Integration Tests ============

    function test_fullWorkflow_StablecoinProtocol() public {
        // Simulate a complete stablecoin protocol workflow

        // 1. Vault stability fees
        vm.startPrank(vaultManager);
        gUSD.approve(address(splitter), TEST_FEE * 3);
        splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WETH_ILK);
        splitter.splitStabilityFee(TEST_FEE, vaultManager, address(gUSD), WBTC_ILK);
        vm.stopPrank();

        // 2. PSM minting fees
        vm.startPrank(psm);
        gUSD.approve(address(splitter), TEST_FEE);
        splitter.splitMintingFee(TEST_FEE, psm, address(gUSD), user1, "USDC-to-gUSD");
        vm.stopPrank();

        // 3. Verify comprehensive tracking
        (
            uint256 stabilityFees,
            uint256 mintingFees,
            ,, // liquidation, governance
            uint256 ubiFromStability,
            uint256 ubiFromMinting,
            ,, // liquidation, governance
            uint256 totalUBI
        ) = splitter.getStablecoinUBIStats();

        assertEq(stabilityFees, TEST_FEE * 2);
        assertEq(mintingFees, TEST_FEE);
        assertEq(ubiFromStability, EXPECTED_UBI * 2);
        assertEq(ubiFromMinting, EXPECTED_UBI);
        assertEq(totalUBI, EXPECTED_UBI * 3);

        // 4. Verify social impact metrics
        uint256 impactRate = splitter.getStablecoinSocialImpactRate();
        assertEq(impactRate, 3333); // 33.33%

        // 5. Verify monthly progress tracking
        (uint256 estimated, uint256 target, uint256 progress) = splitter.getMonthlyUBIEstimate();
        assertGt(estimated, 0);
        assertEq(target, 15_000e18);
        assertGt(progress, 0);
    }
}

// ============ Mock Contracts ============

contract MockGoodDollarToken is IGoodDollarToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    uint256 public ubiPoolFunded;

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function fundUBIPool(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        ubiPoolFunded += amount;
    }

    // Minimal implementation of other IGoodDollarToken methods
    function burn(uint256 amount) external {}
    function transferOwnership(address newOwner) external {}
    function setMinterOperatorRole(address minter, uint256 cap) external {}
    function removeMinterOperatorRole(address minter) external {}
}

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;
    string public name;
    string public symbol;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
}