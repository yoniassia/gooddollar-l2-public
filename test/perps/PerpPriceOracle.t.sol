// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/perps/PerpPriceOracle.sol";

contract PerpPriceOracleTest is Test {
    PerpPriceOracle public oracle;
    address public admin = address(0xAD);
    address public keeper = address(0xAB);
    address public alice = address(0xA1);

    bytes32 public btcKey = keccak256(abi.encodePacked("BTC"));
    bytes32 public ethKey = keccak256(abi.encodePacked("ETH"));
    bytes32 public solKey = keccak256(abi.encodePacked("SOL"));

    // BTC $60,000 = 6_000_000_000_000 (8 decimals)
    uint256 constant BTC_MARK = 6_000_000_000_000;
    uint256 constant BTC_INDEX = 5_999_500_000_000;
    // ETH $3,000 = 300_000_000_000
    uint256 constant ETH_MARK = 300_000_000_000;
    uint256 constant ETH_INDEX = 299_900_000_000;

    function setUp() public {
        vm.prank(admin);
        oracle = new PerpPriceOracle(admin);

        // Register markets
        vm.startPrank(admin);
        oracle.registerMarket(btcKey);
        oracle.registerMarket(ethKey);
        oracle.registerMarket(solKey);
        oracle.setKeeper(keeper, true);
        vm.stopPrank();
    }

    // ============ Deployment ============

    function test_deployment() public view {
        assertEq(oracle.admin(), admin);
        assertTrue(oracle.keepers(admin));
        assertTrue(oracle.keepers(keeper));
        assertTrue(oracle.supportedMarkets(btcKey));
        assertTrue(oracle.supportedMarkets(ethKey));
        assertEq(oracle.maxStaleness(), 120);
        assertEq(oracle.maxDeviationBps(), 2000);
    }

    // ============ Price Updates ============

    function test_updatePrice_singleMarket() public {
        vm.prank(keeper);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);

        assertEq(oracle.getMarkPrice(btcKey), BTC_MARK);
        assertEq(oracle.getIndexPrice(btcKey), BTC_INDEX);
    }

    function test_updatePrice_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit PerpPriceOracle.PriceUpdated(btcKey, BTC_MARK, BTC_INDEX, 3, block.timestamp);

        vm.prank(keeper);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);
    }

    function test_updatePrices_batch() public {
        bytes32[] memory keys = new bytes32[](2);
        keys[0] = btcKey;
        keys[1] = ethKey;

        uint256[] memory marks = new uint256[](2);
        marks[0] = BTC_MARK;
        marks[1] = ETH_MARK;

        uint256[] memory indices = new uint256[](2);
        indices[0] = BTC_INDEX;
        indices[1] = ETH_INDEX;

        uint8[] memory sources = new uint8[](2);
        sources[0] = 3;
        sources[1] = 2;

        vm.prank(keeper);
        oracle.updatePrices(keys, marks, indices, sources);

        assertEq(oracle.getMarkPrice(btcKey), BTC_MARK);
        assertEq(oracle.getMarkPrice(ethKey), ETH_MARK);
        assertEq(oracle.getIndexPrice(btcKey), BTC_INDEX);
        assertEq(oracle.getIndexPrice(ethKey), ETH_INDEX);
    }

    function test_updatePrice_revert_notKeeper() public {
        vm.prank(alice);
        vm.expectRevert(PerpPriceOracle.NotKeeper.selector);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);
    }

    function test_updatePrice_revert_unsupportedMarket() public {
        bytes32 fakeKey = keccak256(abi.encodePacked("FAKE"));
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(PerpPriceOracle.MarketNotSupported.selector, fakeKey));
        oracle.updatePrice(fakeKey, BTC_MARK, BTC_INDEX, 3);
    }

    function test_updatePrice_revert_zeroPrice() public {
        vm.prank(keeper);
        vm.expectRevert(PerpPriceOracle.ZeroPrice.selector);
        oracle.updatePrice(btcKey, 0, BTC_INDEX, 3);
    }

    // ============ Deviation Check ============

    function test_updatePrice_revert_deviationTooLarge() public {
        // Set initial price
        vm.prank(keeper);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);

        // Try to update with >20% deviation
        uint256 wildPrice = BTC_MARK * 125 / 100; // +25%
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(
            PerpPriceOracle.DeviationTooLarge.selector,
            btcKey,
            BTC_MARK,
            wildPrice,
            2500 // 25%
        ));
        oracle.updatePrice(btcKey, wildPrice, wildPrice, 3);
    }

    function test_updatePrice_acceptsReasonableDeviation() public {
        vm.prank(keeper);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);

        // 10% move should be fine (under 20% threshold)
        uint256 newPrice = BTC_MARK * 110 / 100;
        vm.prank(keeper);
        oracle.updatePrice(btcKey, newPrice, newPrice, 3);

        assertEq(oracle.getMarkPrice(btcKey), newPrice);
    }

    // ============ Staleness ============

    function test_getPrice_revert_stalePrice() public {
        vm.prank(keeper);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);

        // Fast-forward past staleness window
        vm.warp(block.timestamp + 121);

        vm.expectRevert(abi.encodeWithSelector(
            PerpPriceOracle.StalePrice.selector,
            btcKey,
            121,
            120
        ));
        oracle.getMarkPrice(btcKey);
    }

    function test_isFresh_returnsCorrectly() public {
        assertFalse(oracle.isFresh(btcKey)); // no price yet

        vm.prank(keeper);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);
        assertTrue(oracle.isFresh(btcKey));

        vm.warp(block.timestamp + 121);
        assertFalse(oracle.isFresh(btcKey));
    }

    // ============ Manual Override ============

    function test_setManualPrice() public {
        vm.prank(admin);
        oracle.setManualPrice(btcKey, BTC_MARK, BTC_INDEX);

        assertEq(oracle.getMarkPrice(btcKey), BTC_MARK);

        // Manual override survives staleness
        vm.warp(block.timestamp + 10000);
        assertEq(oracle.getMarkPrice(btcKey), BTC_MARK);
        assertTrue(oracle.isFresh(btcKey));
    }

    function test_clearManualOverride_revertOnStale() public {
        vm.prank(admin);
        oracle.setManualPrice(btcKey, BTC_MARK, BTC_INDEX);

        vm.warp(block.timestamp + 200);

        // Still fresh due to manual override
        assertEq(oracle.getMarkPrice(btcKey), BTC_MARK);

        // Clear override → now stale
        vm.prank(admin);
        oracle.clearManualOverride(btcKey);

        vm.expectRevert(); // StalePrice
        oracle.getMarkPrice(btcKey);
    }

    // ============ IPriceOraclePerp Interface ============

    function test_getPriceByKey_compatible() public {
        vm.prank(keeper);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);

        // getPriceByKey returns markPrice, compatible with PerpEngine
        assertEq(oracle.getPriceByKey(btcKey), BTC_MARK);
    }

    // ============ getPriceData ============

    function test_getPriceData_returnsFullStruct() public {
        vm.prank(keeper);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);

        PerpPriceOracle.PriceData memory data = oracle.getPriceData(btcKey);
        assertEq(data.markPrice, BTC_MARK);
        assertEq(data.indexPrice, BTC_INDEX);
        assertEq(data.numSources, 3);
        assertFalse(data.manualOverride);
    }

    // ============ Admin Config ============

    function test_setMaxStaleness() public {
        vm.prank(admin);
        oracle.setMaxStaleness(300);
        assertEq(oracle.maxStaleness(), 300);

        // Now 200-second old price is still fresh
        vm.prank(keeper);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);
        vm.warp(block.timestamp + 200);
        assertEq(oracle.getMarkPrice(btcKey), BTC_MARK); // no revert
    }

    function test_setMaxDeviation() public {
        vm.prank(keeper);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);

        // Set tighter deviation (5%)
        vm.prank(admin);
        oracle.setMaxDeviation(500);

        // 10% move now reverts
        uint256 newPrice = BTC_MARK * 110 / 100;
        vm.prank(keeper);
        vm.expectRevert(); // DeviationTooLarge
        oracle.updatePrice(btcKey, newPrice, newPrice, 3);
    }

    function test_removeAndAddKeeper() public {
        vm.prank(admin);
        oracle.setKeeper(keeper, false);

        vm.prank(keeper);
        vm.expectRevert(PerpPriceOracle.NotKeeper.selector);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);

        // Admin can still update
        vm.prank(admin);
        oracle.updatePrice(btcKey, BTC_MARK, BTC_INDEX, 3);
    }
}
