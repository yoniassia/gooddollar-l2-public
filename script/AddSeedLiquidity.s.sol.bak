// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

/**
 * @title AddSeedLiquidity
 * @notice Adds initial seed liquidity to all GoodSwap pools.
 *         This bootstraps the DEX so users can start trading immediately.
 *
 * @dev Liquidity is added as full-range positions (similar to V2 behavior).
 *      In production, consider concentrated ranges for better capital efficiency.
 *
 *      Seed liquidity per pool:
 *      - G$/ETH:   100M G$ + 2 ETH
 *      - G$/USDC:  100M G$ + 2,000 USDC
 *      - ETH/USDC: 5 ETH + 17,500 USDC
 *      - G$/DAI:   50M G$ + 1,000 DAI
 *
 * Prerequisites:
 *   - CreatePools.s.sol must have been run first
 *   - Deployer must hold sufficient G$, WETH, USDC, DAI
 *   - Set env vars: POOL_MANAGER, UBI_FEE_HOOK, G_DOLLAR, WETH, USDC, DAI
 *
 * Usage:
 *   forge script script/AddSeedLiquidity.s.sol --rpc-url $RPC_URL --broadcast
 */

// ============ Minimal V4 types ============

type Currency is address;

struct PoolKey {
    Currency currency0;
    Currency currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct ModifyLiquidityParams {
    int24 tickLower;
    int24 tickUpper;
    int256 liquidityDelta;
    bytes32 salt;
}

struct BalanceDelta {
    int128 amount0;
    int128 amount1;
}

interface IPoolManager {
    function unlock(bytes calldata data) external returns (bytes memory);
    function modifyLiquidity(
        PoolKey memory key,
        ModifyLiquidityParams memory params,
        bytes calldata hookData
    ) external returns (BalanceDelta memory callerDelta, BalanceDelta memory feesAccrued);
    function settle() external payable returns (uint256);
    function take(Currency currency, address to, uint256 amount) external;
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @notice Liquidity provisioning contract that implements the unlock callback.
 * @dev In production, use PositionManager from v4-periphery for NFT-based LP positions.
 *      This is a simplified version for seed liquidity bootstrapping.
 */
contract SeedLiquidityProvider {
    IPoolManager public immutable poolManager;
    address public immutable deployer;

    constructor(IPoolManager _poolManager) {
        poolManager = _poolManager;
        deployer = msg.sender;
    }

    struct AddLiquidityParams {
        PoolKey key;
        int24 tickLower;
        int24 tickUpper;
        int256 liquidityDelta;
    }

    function addLiquidity(AddLiquidityParams calldata params) external {
        require(msg.sender == deployer, "Only deployer");
        bytes memory data = abi.encode(params);
        poolManager.unlock(data);
    }

    /// @notice Called by PoolManager after unlock
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only PoolManager");

        AddLiquidityParams memory params = abi.decode(data, (AddLiquidityParams));

        // Add liquidity
        (BalanceDelta memory delta, ) = poolManager.modifyLiquidity(
            params.key,
            ModifyLiquidityParams({
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                liquidityDelta: params.liquidityDelta,
                salt: bytes32(0)
            }),
            ""
        );

        // Settle negative deltas (tokens owed to PoolManager)
        if (delta.amount0 < 0) {
            address token = Currency.unwrap(params.key.currency0);
            uint256 amount = uint256(uint128(-delta.amount0));
            IERC20(token).transfer(address(poolManager), amount);
            poolManager.settle();
        }
        if (delta.amount1 < 0) {
            address token = Currency.unwrap(params.key.currency1);
            uint256 amount = uint256(uint128(-delta.amount1));
            IERC20(token).transfer(address(poolManager), amount);
            poolManager.settle();
        }

        // Take positive deltas (tokens owed to us — unlikely for adding liquidity)
        if (delta.amount0 > 0) {
            poolManager.take(params.key.currency0, deployer, uint256(uint128(delta.amount0)));
        }
        if (delta.amount1 > 0) {
            poolManager.take(params.key.currency1, deployer, uint256(uint128(delta.amount1)));
        }

        return "";
    }
}

contract AddSeedLiquidity is Script {
    // ============ Liquidity Amounts ============

    // G$/ETH pool: 100M G$ + 2 ETH
    int256 constant LIQUIDITY_GD_ETH = 1_000_000e18; // Liquidity units (not token amounts)

    // G$/USDC pool: 100M G$ + 2,000 USDC
    int256 constant LIQUIDITY_GD_USDC = 1_000_000e18;

    // ETH/USDC pool: 5 ETH + 17,500 USDC
    int256 constant LIQUIDITY_ETH_USDC = 500_000e18;

    // G$/DAI pool: 50M G$ + 1,000 DAI
    int256 constant LIQUIDITY_GD_DAI = 500_000e18;

    // Full range tick bounds (for tickSpacing = 60)
    int24 constant MIN_TICK_60 = -887220;
    int24 constant MAX_TICK_60 = 887220;

    // Full range tick bounds (for tickSpacing = 10)
    int24 constant MIN_TICK_10 = -887270;
    int24 constant MAX_TICK_10 = 887270;

    // Fee tiers
    uint24 constant FEE_030 = 3000;
    uint24 constant FEE_005 = 500;

    function run() external {
        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerPrivateKey);

        // Read deployed addresses
        address poolManagerAddr = vm.envOr("POOL_MANAGER", address(0x1));
        address hookAddr = vm.envOr("UBI_FEE_HOOK", address(0x2));
        address gdAddr = vm.envOr("G_DOLLAR", address(0x10));
        address wethAddr = vm.envOr("WETH", address(0x11));
        address usdcAddr = vm.envOr("USDC", address(0x12));
        address daiAddr = vm.envOr("DAI", address(0x13));

        IPoolManager poolManager = IPoolManager(poolManagerAddr);

        console.log("=== Adding Seed Liquidity to GoodSwap ===");
        console.log("Deployer:", deployer);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy the liquidity provider helper
        SeedLiquidityProvider provider = new SeedLiquidityProvider(poolManager);
        console.log("SeedLiquidityProvider:", address(provider));

        // Approve tokens to the provider
        uint256 maxApproval = type(uint256).max;
        IERC20(gdAddr).approve(address(provider), maxApproval);
        IERC20(wethAddr).approve(address(provider), maxApproval);
        IERC20(usdcAddr).approve(address(provider), maxApproval);
        IERC20(daiAddr).approve(address(provider), maxApproval);

        // Transfer tokens to provider for settlement
        // (In production, use a more sophisticated approach)
        IERC20(gdAddr).transfer(address(provider), 300_000_000e18);   // 300M G$
        IERC20(wethAddr).transfer(address(provider), 10 ether);       // 10 WETH
        IERC20(usdcAddr).transfer(address(provider), 25_000e6);       // 25K USDC (6 decimals)
        IERC20(daiAddr).transfer(address(provider), 2_000e18);        // 2K DAI

        // ─── Pool 1: G$/ETH ───
        {
            (Currency c0, Currency c1) = sortCurrencies(gdAddr, wethAddr);
            provider.addLiquidity(SeedLiquidityProvider.AddLiquidityParams({
                key: PoolKey(c0, c1, FEE_030, int24(60), hookAddr),
                tickLower: MIN_TICK_60,
                tickUpper: MAX_TICK_60,
                liquidityDelta: LIQUIDITY_GD_ETH
            }));
            console.log("Added liquidity to G$/ETH pool");
        }

        // ─── Pool 2: G$/USDC ───
        {
            (Currency c0, Currency c1) = sortCurrencies(gdAddr, usdcAddr);
            provider.addLiquidity(SeedLiquidityProvider.AddLiquidityParams({
                key: PoolKey(c0, c1, FEE_030, int24(60), hookAddr),
                tickLower: MIN_TICK_60,
                tickUpper: MAX_TICK_60,
                liquidityDelta: LIQUIDITY_GD_USDC
            }));
            console.log("Added liquidity to G$/USDC pool");
        }

        // ─── Pool 3: ETH/USDC ───
        {
            (Currency c0, Currency c1) = sortCurrencies(wethAddr, usdcAddr);
            provider.addLiquidity(SeedLiquidityProvider.AddLiquidityParams({
                key: PoolKey(c0, c1, FEE_005, int24(10), hookAddr),
                tickLower: MIN_TICK_10,
                tickUpper: MAX_TICK_10,
                liquidityDelta: LIQUIDITY_ETH_USDC
            }));
            console.log("Added liquidity to ETH/USDC pool");
        }

        // ─── Pool 4: G$/DAI ───
        {
            (Currency c0, Currency c1) = sortCurrencies(gdAddr, daiAddr);
            provider.addLiquidity(SeedLiquidityProvider.AddLiquidityParams({
                key: PoolKey(c0, c1, FEE_030, int24(60), hookAddr),
                tickLower: MIN_TICK_60,
                tickUpper: MAX_TICK_60,
                liquidityDelta: LIQUIDITY_GD_DAI
            }));
            console.log("Added liquidity to G$/DAI pool");
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== Seed Liquidity Added ===");
        console.log("Pools bootstrapped:");
        console.log("  - G$/ETH   (100M G$ + 2 ETH)");
        console.log("  - G$/USDC  (100M G$ + 2,000 USDC)");
        console.log("  - ETH/USDC (5 ETH + 17,500 USDC)");
        console.log("  - G$/DAI   (50M G$ + 1,000 DAI)");
        console.log("");
        console.log("GoodSwap is ready for trading!");
        console.log("Next: Register with Li.Fi for cross-chain swaps");
    }

    function sortCurrencies(address a, address b) internal pure returns (Currency, Currency) {
        if (a < b) {
            return (Currency.wrap(a), Currency.wrap(b));
        } else {
            return (Currency.wrap(b), Currency.wrap(a));
        }
    }
}
