// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/oracle/SwapPriceOracle.sol";

contract SwapPriceOracleTest is Test {
    SwapPriceOracle oracle;
    address admin = address(0xAD);
    address keeper = address(0xBE);
    address eth = address(0x1111);
    address gdollar = address(0x2222);
    address usdc = address(0x3333);

    function setUp() public {
        vm.prank(admin);
        oracle = new SwapPriceOracle(admin);

        vm.startPrank(admin);
        oracle.setKeeper(keeper, true);
        oracle.registerToken(eth, "ETH", 18, 300);
        oracle.registerToken(gdollar, "G$", 18, 300);
        oracle.registerToken(usdc, "USDC", 6, 600);
        vm.stopPrank();
    }

    function test_registerToken() public view {
        (string memory symbol, uint8 decimals, uint256 maxAge, bool active) = oracle.tokenConfigs(eth);
        assertEq(symbol, "ETH");
        assertEq(decimals, 18);
        assertEq(maxAge, 300);
        assertTrue(active);
    }

    function test_updatePrice() public {
        vm.prank(keeper);
        oracle.updatePrice(eth, 350_000_000_000); // $3,500

        uint256 price = oracle.getPrice(eth);
        assertEq(price, 350_000_000_000);
    }

    function test_batchUpdatePrices() public {
        address[] memory tokens = new address[](3);
        tokens[0] = eth;
        tokens[1] = gdollar;
        tokens[2] = usdc;

        uint256[] memory _prices = new uint256[](3);
        _prices[0] = 350_000_000_000;   // ETH $3,500
        _prices[1] = 1_500_000;          // G$ $0.015
        _prices[2] = 100_000_000;        // USDC $1.00

        vm.prank(keeper);
        oracle.batchUpdatePrices(tokens, _prices);

        assertEq(oracle.getPrice(eth), 350_000_000_000);
        assertEq(oracle.getPrice(gdollar), 1_500_000);
        assertEq(oracle.getPrice(usdc), 100_000_000);
    }

    function test_stalePrice_reverts() public {
        vm.prank(keeper);
        oracle.updatePrice(eth, 350_000_000_000);

        // Warp past staleness
        vm.warp(block.timestamp + 301);
        vm.expectRevert();
        oracle.getPrice(eth);
    }

    function test_getPriceUnsafe_ignoresStaleness() public {
        vm.prank(keeper);
        oracle.updatePrice(eth, 350_000_000_000);

        vm.warp(block.timestamp + 9999);
        (uint256 price,) = oracle.getPriceUnsafe(eth);
        assertEq(price, 350_000_000_000);
    }

    function test_deviationTooHigh_reverts() public {
        vm.prank(keeper);
        oracle.updatePrice(eth, 350_000_000_000);

        // 30% jump should fail (max is 25%)
        vm.prank(keeper);
        vm.expectRevert();
        oracle.updatePrice(eth, 455_000_000_000);
    }

    function test_smallDeviation_succeeds() public {
        vm.prank(keeper);
        oracle.updatePrice(eth, 350_000_000_000);

        // 10% increase should be fine
        vm.warp(block.timestamp + 1);
        vm.prank(keeper);
        oracle.updatePrice(eth, 385_000_000_000);
        assertEq(oracle.getPrice(eth), 385_000_000_000);
    }

    function test_adminOverride_bypassesDeviation() public {
        vm.prank(keeper);
        oracle.updatePrice(eth, 350_000_000_000);

        // Admin can set any price
        vm.prank(admin);
        oracle.adminSetPrice(eth, 500_000_000_000);
        assertEq(oracle.getPrice(eth), 500_000_000_000);
    }

    function test_getRelativePrice() public {
        vm.startPrank(keeper);
        oracle.updatePrice(eth, 350_000_000_000);   // $3,500
        oracle.updatePrice(usdc, 100_000_000);       // $1.00
        vm.stopPrank();

        uint256 ethInUsdc = oracle.getRelativePrice(eth, usdc);
        // Should be 3500 * 1e18
        assertEq(ethInUsdc, 3500 * 1e18);
    }

    function test_notKeeper_reverts() public {
        address rando = address(0xDEAD);
        vm.prank(rando);
        vm.expectRevert();
        oracle.updatePrice(eth, 350_000_000_000);
    }

    function test_unregisteredToken_reverts() public {
        address fake = address(0x9999);
        vm.prank(keeper);
        vm.expectRevert();
        oracle.updatePrice(fake, 100_000_000);
    }

    function test_zeroPrice_reverts() public {
        vm.prank(keeper);
        vm.expectRevert();
        oracle.updatePrice(eth, 0);
    }

    function test_removeToken() public {
        vm.prank(keeper);
        oracle.updatePrice(eth, 350_000_000_000);

        vm.prank(admin);
        oracle.removeToken(eth);

        // update should revert (token inactive)
        vm.prank(keeper);
        vm.expectRevert();
        oracle.updatePrice(eth, 350_000_000_000);
    }

    function test_removeToken_zerosPrice() public {
        vm.prank(keeper);
        oracle.updatePrice(eth, 350_000_000_000);

        vm.prank(admin);
        oracle.removeToken(eth);

        (uint256 price, uint256 timestamp) = oracle.getPriceUnsafe(eth);
        assertEq(price, 0);
        assertEq(timestamp, 0);
    }

    function test_removeToken_decreasesCount() public {
        assertEq(oracle.registeredTokenCount(), 3);

        vm.prank(admin);
        oracle.removeToken(eth);

        assertEq(oracle.registeredTokenCount(), 2);
    }

    function test_removeToken_removesFromArray() public {
        vm.prank(admin);
        oracle.removeToken(eth);

        address[] memory tokens = oracle.getAllTokens();
        assertEq(tokens.length, 2);
        for (uint256 i = 0; i < tokens.length; i++) {
            assertTrue(tokens[i] != eth, "eth should not be in array after removal");
        }
    }

    function test_removeToken_canReregister() public {
        vm.prank(admin);
        oracle.removeToken(eth);

        // Re-register and it should work cleanly
        vm.prank(admin);
        oracle.registerToken(eth, "ETH", 18, 300);
        assertEq(oracle.registeredTokenCount(), 3);

        vm.prank(keeper);
        oracle.updatePrice(eth, 350_000_000_000);
        assertEq(oracle.getPrice(eth), 350_000_000_000);
    }

    function test_getAllTokens() public view {
        address[] memory tokens = oracle.getAllTokens();
        assertEq(tokens.length, 3);
        // Order is insertion order (swap-and-pop only changes order on removal)
        assertEq(tokens[0], eth);
        assertEq(tokens[1], gdollar);
        assertEq(tokens[2], usdc);
    }

    function test_twap_returnsSpotWhenFresh() public {
        vm.prank(keeper);
        oracle.updatePrice(eth, 350_000_000_000);

        uint256 twap = oracle.getTWAP(eth);
        assertEq(twap, 350_000_000_000);
    }

    function test_twap_accumulates() public {
        vm.prank(keeper);
        oracle.updatePrice(eth, 300_000_000_000);

        vm.warp(block.timestamp + 100);
        vm.prank(keeper);
        oracle.updatePrice(eth, 350_000_000_000);

        vm.warp(block.timestamp + 100);
        // TWAP should be between 300B and 350B
        uint256 twap = oracle.getTWAP(eth);
        assertTrue(twap >= 300_000_000_000 && twap <= 350_000_000_000);
    }
}
