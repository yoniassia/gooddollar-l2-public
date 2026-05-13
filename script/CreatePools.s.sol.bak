// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

/**
 * @title CreatePools
 * @notice Creates the initial GoodSwap liquidity pools on Uniswap V4:
 *         - G$/ETH   (0.30% fee, tick spacing 60)
 *         - G$/USDC  (0.30% fee, tick spacing 60)
 *         - ETH/USDC (0.05% fee, tick spacing 10)
 *         - G$/DAI   (0.30% fee, tick spacing 60)
 *
 * @dev All pools use the UBIFeeHook as their hook contract.
 *      Pool initialization does NOT require unlocking the PoolManager.
 *
 * Prerequisites:
 *   - DeployGoodSwap.s.sol must have been run first
 *   - Set env vars: POOL_MANAGER, UBI_FEE_HOOK, G_DOLLAR, WETH, USDC, DAI
 *
 * Usage:
 *   forge script script/CreatePools.s.sol --rpc-url $RPC_URL --broadcast
 */

// ============ Minimal V4 types (replace with real imports when v4-core installed) ============

/// @notice Currency type (address wrapper in V4)
type Currency is address;

/// @notice Pool key uniquely identifies a pool
struct PoolKey {
    Currency currency0;
    Currency currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

/// @notice Minimal IPoolManager interface for pool initialization
interface IPoolManager {
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
}

library SqrtPriceMath {
    /// @notice Calculate sqrtPriceX96 from a price ratio
    /// @param price The price as a fixed-point number (token1/token0 * 1e18)
    /// @return sqrtPriceX96 The sqrt price in Q64.96 format
    function encodeSqrtPrice(uint256 price) internal pure returns (uint160) {
        // sqrtPriceX96 = sqrt(price) * 2^96
        // For simplicity, we use pre-computed values for known price points
        // In production, use a proper sqrt library
        return uint160(sqrt(price) * (2**96) / 1e9);
    }

    function sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }
}

contract CreatePools is Script {
    using SqrtPriceMath for uint256;

    // ============ Pool Configuration ============

    // Fee tiers (in hundredths of a bip)
    uint24 constant FEE_030 = 3000;  // 0.30%
    uint24 constant FEE_005 = 500;   // 0.05%

    // Tick spacing
    int24 constant TICK_SPACING_60 = 60;
    int24 constant TICK_SPACING_10 = 10;

    // Pre-computed sqrtPriceX96 values
    // These assume specific initial prices — adjust for actual market prices at deployment

    // G$/ETH: 1 ETH = 50,000,000 G$ → price(token1/token0) depends on sort order
    // If G$ < ETH address: currency0=G$, currency1=ETH, price = ETH/G$ = 0.00000002
    // sqrtPriceX96 = sqrt(0.00000002) * 2^96 ≈ 11,197,547,012 (approximate)
    uint160 constant SQRT_PRICE_GD_ETH = 11_197_547_012;

    // G$/USDC: 1 USDC = 50,000 G$ → price = USDC/G$ = 0.00002
    // sqrtPriceX96 = sqrt(0.00002) * 2^96 ≈ 354,105,546,088
    uint160 constant SQRT_PRICE_GD_USDC = 354_105_546_088;

    // ETH/USDC: 1 ETH = 3,500 USDC → price = USDC/ETH = 3500
    // sqrtPriceX96 = sqrt(3500) * 2^96 ≈ 4,688,088,259,057,244_000_000_000
    uint160 constant SQRT_PRICE_ETH_USDC = 4_688_088_259_057_244_000;

    // G$/DAI: 1 DAI = 50,000 G$ → same as G$/USDC
    uint160 constant SQRT_PRICE_GD_DAI = 354_105_546_088;

    function run() external {
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        // Read deployed addresses from env (set these after DeployGoodSwap runs)
        address poolManagerAddr = vm.envOr("POOL_MANAGER", address(0x1));
        address hookAddr = vm.envOr("UBI_FEE_HOOK", address(0x2));
        address gdAddr = vm.envOr("G_DOLLAR", address(0x10));
        address wethAddr = vm.envOr("WETH", address(0x11));
        address usdcAddr = vm.envOr("USDC", address(0x12));
        address daiAddr = vm.envOr("DAI", address(0x13));

        IPoolManager poolManager = IPoolManager(poolManagerAddr);

        console.log("=== Creating GoodSwap Pools ===");
        console.log("PoolManager:", poolManagerAddr);
        console.log("UBIFeeHook:", hookAddr);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // ─── Pool 1: G$/ETH ───
        {
            (Currency c0, Currency c1) = sortCurrencies(gdAddr, wethAddr);
            PoolKey memory key = PoolKey({
                currency0: c0,
                currency1: c1,
                fee: FEE_030,
                tickSpacing: TICK_SPACING_60,
                hooks: hookAddr
            });

            // Determine sqrtPrice based on sort order
            uint160 sqrtPrice = Currency.unwrap(c0) == gdAddr
                ? SQRT_PRICE_GD_ETH
                : uint160(type(uint160).max / SQRT_PRICE_GD_ETH); // Invert if sorted differently

            int24 tick = poolManager.initialize(key, sqrtPrice);
            console.log("Pool G$/ETH created at tick:", uint256(uint24(tick)));
        }

        // ─── Pool 2: G$/USDC ───
        {
            (Currency c0, Currency c1) = sortCurrencies(gdAddr, usdcAddr);
            PoolKey memory key = PoolKey({
                currency0: c0,
                currency1: c1,
                fee: FEE_030,
                tickSpacing: TICK_SPACING_60,
                hooks: hookAddr
            });

            uint160 sqrtPrice = Currency.unwrap(c0) == gdAddr
                ? SQRT_PRICE_GD_USDC
                : uint160(type(uint160).max / SQRT_PRICE_GD_USDC);

            int24 tick = poolManager.initialize(key, sqrtPrice);
            console.log("Pool G$/USDC created at tick:", uint256(uint24(tick)));
        }

        // ─── Pool 3: ETH/USDC ───
        {
            (Currency c0, Currency c1) = sortCurrencies(wethAddr, usdcAddr);
            PoolKey memory key = PoolKey({
                currency0: c0,
                currency1: c1,
                fee: FEE_005,
                tickSpacing: TICK_SPACING_10,
                hooks: hookAddr
            });

            uint160 sqrtPrice = Currency.unwrap(c0) == wethAddr
                ? SQRT_PRICE_ETH_USDC
                : uint160(type(uint160).max / SQRT_PRICE_ETH_USDC);

            int24 tick = poolManager.initialize(key, sqrtPrice);
            console.log("Pool ETH/USDC created at tick:", uint256(uint24(tick)));
        }

        // ─── Pool 4: G$/DAI ───
        {
            (Currency c0, Currency c1) = sortCurrencies(gdAddr, daiAddr);
            PoolKey memory key = PoolKey({
                currency0: c0,
                currency1: c1,
                fee: FEE_030,
                tickSpacing: TICK_SPACING_60,
                hooks: hookAddr
            });

            uint160 sqrtPrice = Currency.unwrap(c0) == gdAddr
                ? SQRT_PRICE_GD_DAI
                : uint160(type(uint160).max / SQRT_PRICE_GD_DAI);

            int24 tick = poolManager.initialize(key, sqrtPrice);
            console.log("Pool G$/DAI created at tick:", uint256(uint24(tick)));
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== All 4 pools created ===");
        console.log("Next: Run AddSeedLiquidity.s.sol");
    }

    /// @notice Sort two addresses into currency0 (lower) and currency1 (higher)
    function sortCurrencies(address a, address b) internal pure returns (Currency, Currency) {
        if (a < b) {
            return (Currency.wrap(a), Currency.wrap(b));
        } else {
            return (Currency.wrap(b), Currency.wrap(a));
        }
    }
}
