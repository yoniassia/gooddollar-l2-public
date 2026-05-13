// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/stocks/CollateralVault.sol";
import "../src/stocks/SyntheticAsset.sol";
import "../src/stocks/PriceOracle.sol";

// ============ Mocks ============

contract MockGoodDollar {
    string public name = "GoodDollar";
    string public symbol = "G$";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient");
        require(allowance[from][msg.sender] >= amount, "Allowance");
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

contract MockFeeSplitter {
    uint256 public lastFee;
    address public lastDApp;

    function splitFee(uint256 totalFee, address dAppRecipient) external returns (uint256, uint256, uint256) {
        lastFee = totalFee;
        lastDApp = dAppRecipient;
        return (totalFee * 33 / 100, totalFee * 17 / 100, totalFee * 50 / 100);
    }
}

// ============ Test Contract ============

contract CollateralVaultTest is Test {
    CollateralVault public vault;
    MockGoodDollar public gd;
    PriceOracle public oracle;
    MockFeeSplitter public feeSplitter;
    SyntheticAsset public sAAPL;

    address public admin = address(0xAD);
    address public user = address(0xBEEF);
    address public liquidator = address(0xCAFE);

    string constant TICKER = "AAPL";

    function setUp() public {
        gd = new MockGoodDollar();

        oracle = new PriceOracle(admin);
        // Price: $150 per share (8 decimals)
        vm.prank(admin);
        oracle.setManualPrice(TICKER, 150 * 1e8, true);

        feeSplitter = new MockFeeSplitter();

        vault = new CollateralVault(
            address(gd),
            address(oracle),
            address(feeSplitter),
            admin
        );

        sAAPL = new SyntheticAsset("Synthetic AAPL", "sAAPL", address(vault));

        vm.prank(admin);
        vault.registerAsset(TICKER, address(sAAPL));

        gd.mint(user, 1_000_000e18);
        gd.mint(liquidator, 1_000_000e18);

        vm.prank(user);
        gd.approve(address(vault), type(uint256).max);
        vm.prank(liquidator);
        gd.approve(address(vault), type(uint256).max);
    }

    // ============ Helper ============

    /// @dev Set up a position: deposit collateralG and mint synthAmt for `who`.
    function _openPositionAs(address who, uint256 collateralG, uint256 synthAmt) internal {
        gd.mint(who, collateralG + 1e18); // extra to cover fee
        vm.startPrank(who);
        gd.approve(address(vault), type(uint256).max);
        vault.depositCollateral(TICKER, collateralG);
        if (synthAmt > 0) vault.mint(TICKER, synthAmt);
        vm.stopPrank();
    }

    // ============ Liquidation Reward Calculation Tests (GOO-39 fix) ============

    /**
     * Normal liquidation — no cap.
     *
     * Setup:
     *   - Price: $150, 1 share minted, collateral = 225 G$ (150% ratio)
     *   - Price pumps to $200 -> ratio = 225/200 = 112.5% < 120% -> liquidatable
     *
     * Reward math at $200:
     *   debtValueG  = 200 G$
     *   bonus       = 200 * 10% = 20 G$
     *   reward      = 220 G$  (< 225 collateral -> no cap)
     *   remaining   = 225 - 220 = 5 G$ -> feeSplitter
     *
     * Event must emit collateralSeized=220 G$ and bonus=20 G$ (NOT 225 and 220).
     */
    function test_liquidate_eventFields_collateralSeizedAndBonus() public {
        _openPositionAs(user, 225e18, 1e18);

        // Drop to $200 to make liquidatable
        vm.prank(admin);
        oracle.setManualPrice(TICKER, 200 * 1e8, true);

        // Give liquidator the 1 sAAPL share needed
        _openPositionAs(address(0xDEAD), 400e18, 1e18);
        vm.prank(address(0xDEAD));
        sAAPL.transfer(liquidator, 1e18);

        uint256 liqBefore = gd.balanceOf(liquidator);

        bytes32 key = keccak256(abi.encodePacked(TICKER));
        vm.expectEmit(true, true, true, true);
        // collateralSeized = 220 G$  (liquidatorReward, NOT userCollateral 225 G$)
        // bonus            =  20 G$  (the delta only, NOT the full 220 G$)
        emit CollateralVault.Liquidated(liquidator, user, key, 1e18, 220e18, 20e18);

        vm.prank(liquidator);
        vault.liquidate(user, TICKER);

        // Verify actual token movement
        assertEq(gd.balanceOf(liquidator), liqBefore + 220e18, "liquidator should receive 220 G$");
        assertEq(feeSplitter.lastFee(), 5e18, "feeSplitter should receive 5 G$");

        // Position cleared
        assertEq(vault.debt(user, key), 0, "user debt not cleared");
        assertEq(vault.collateral(user, key), 0, "user collateral not cleared");
    }

    /**
     * Capped liquidation — extreme undercollateralization.
     *
     * Setup:
     *   - Price: $150, 1 share, collateral = 225 G$
     *   - Price jumps to $300 -> ratio = 225/300 = 75% -> severely undercollateralized
     *
     * Reward math at $300:
     *   debtValueG  = 300 G$
     *   bonus       = 300 * 10% = 30 G$
     *   reward      = 330 G$  > 225 collateral -> CAP: reward = 225 G$
     *   actualBonus = 225 - 300 = negative -> 0 (floored)
     *   remaining   = 0
     *
     * Event must emit collateralSeized=225 G$ and bonus=0.
     */
    function test_liquidate_eventFields_capped_bonusIsZero() public {
        _openPositionAs(user, 225e18, 1e18);

        vm.prank(admin);
        oracle.setManualPrice(TICKER, 300 * 1e8, true);

        _openPositionAs(address(0xDEAD), 600e18, 1e18);
        vm.prank(address(0xDEAD));
        sAAPL.transfer(liquidator, 1e18);

        bytes32 key = keccak256(abi.encodePacked(TICKER));
        vm.expectEmit(true, true, true, true);
        // reward is capped at 225 G$; bonus = max(225 - 300, 0) = 0
        emit CollateralVault.Liquidated(liquidator, user, key, 1e18, 225e18, 0);

        // Record feeSplitter state before liquidation — _openPositionAs(0xDEAD) already set lastFee.
        // We verify that the liquidation itself does NOT call splitFee (lastFee unchanged).
        uint256 feeSplitterLastFeeBeforeLiq = feeSplitter.lastFee();

        vm.prank(liquidator);
        vault.liquidate(user, TICKER);

        // feeSplitter gets nothing during the capped liquidation (full collateral went to liquidator).
        assertEq(feeSplitter.lastFee(), feeSplitterLastFeeBeforeLiq, "feeSplitter should not be called during capped liquidation");
    }

    /**
     * Verify the pre-fix buggy values are NOT emitted:
     *   - collateralSeized must NOT equal userCollateral (225) when reward is 220
     *   - bonus must NOT equal liquidatorReward (220) when actual bonus is 20
     */
    function test_liquidate_eventFields_notOldBuggyValues() public {
        _openPositionAs(user, 225e18, 1e18);

        vm.prank(admin);
        oracle.setManualPrice(TICKER, 200 * 1e8, true);

        _openPositionAs(address(0xDEAD), 400e18, 1e18);
        vm.prank(address(0xDEAD));
        sAAPL.transfer(liquidator, 1e18);

        vm.recordLogs();
        vm.prank(liquidator);
        vault.liquidate(user, TICKER);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length == 4) {
                (uint256 synthRepaid, uint256 colSeized, uint256 bonusAmt) =
                    abi.decode(logs[i].data, (uint256, uint256, uint256));

                // Old buggy: collateralSeized was userCollateral (225 G$)
                assertNotEq(colSeized, 225e18, "BUG: collateralSeized equals userCollateral");
                // Correct: collateralSeized equals liquidatorReward (220 G$)
                assertEq(colSeized, 220e18, "collateralSeized should be liquidatorReward");

                // Old buggy: bonus was liquidatorReward (220 G$)
                assertNotEq(bonusAmt, 220e18, "BUG: bonus equals liquidatorReward");
                // Correct: bonus is the delta (20 G$)
                assertEq(bonusAmt, 20e18, "bonus should be 10% of debtValue");

                assertEq(synthRepaid, 1e18, "syntheticRepaid should be full debt");
                found = true;
                break;
            }
        }
        assertTrue(found, "Liquidated event not found");
    }

    // ============ Guard Tests ============

    function test_liquidate_revertsHealthyPosition() public {
        _openPositionAs(user, 225e18, 1e18);
        // Price stays at $150 -> ratio = 225/150 = 150% > 120%
        vm.prank(liquidator);
        vm.expectRevert();
        vault.liquidate(user, TICKER);
    }

    function test_liquidate_revertsNoDebt() public {
        // Deposit collateral but don't mint any synthetic
        _openPositionAs(user, 225e18, 0);
        vm.prank(liquidator);
        vm.expectRevert();
        vault.liquidate(user, TICKER);
    }
}
