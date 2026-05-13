// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/oracle/SwapPriceOracle.sol";

/**
 * @title FixSwapPriceOracle
 * @notice Fixes GOO-308: SwapPriceOracle has stale/zero prices and wrong token
 *         addresses from the original deploy which used placeholder hardhat addresses.
 *
 * Problems being fixed:
 *   1. Old GDT (0x5FbDB...) registered as G$ — redeployed GDT is 0x6533158b...
 *   2. Old UBIFeeSplitter (0xe7f172...) registered as WETH — wrong contract entirely
 *   3. ValidatorStaking (0x9fe467...) registered as USDC — wrong contract entirely
 *   4. Prices are stale (timestamp days old, maxAge=300s — no keeper on devnet)
 *   5. New GoodDollarToken, SwapWETH, SwapUSDC, SwapGD not registered at all
 *
 * Fix:
 *   1. Deactivate old wrong-address tokens
 *   2. Set defaultMaxAge to 365 days (no keeper on devnet)
 *   3. Register correct tokens with long per-token maxAge
 *   4. Seed fresh prices via adminSetPrice (bypasses deviation guard)
 *
 * Usage (devnet):
 *   forge script script/FixSwapPriceOracle.s.sol \
 *     --rpc-url https://rpc.goodclaw.org --broadcast --legacy
 */
contract FixSwapPriceOracle is Script {

    // Live oracle on devnet (chain 42069)
    SwapPriceOracle constant ORACLE =
        SwapPriceOracle(0xde2Bd2ffEA002b8E84ADeA96e5976aF664115E2c);

    // Wrong/stale tokens to deactivate
    address constant OLD_GDT      = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    address constant OLD_UBI_AS_WETH = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;
    address constant VSTAKING_AS_USDC = 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0;
    address constant WBTC_MOCK    = 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9;
    // 5th token (G$ at unknown intermediate address) — registered with G$ symbol
    address constant OLD_GDT2     = 0x8198f5d8F8CfFE8f9C413d98a0A55aEB8ab9FbB7;

    // Correct token addresses (from devnet.ts)
    address constant NEW_GDT  = 0x6533158b042775e2FdFeF3cA1a782EFDbB8EB9b1;
    address constant SWAP_GD  = 0x367761085BF3C12e5DA2Df99AC6E1a824612b8fb;
    address constant SWAP_WETH = 0x7A9Ec1d04904907De0ED7b6839CcdD59c3716AC9;
    address constant SWAP_USDC = 0x4631BCAbD6dF18D94796344963cB60d44a4136b6;

    // 365 days — no keeper on devnet, prevent stale-price reverts
    uint256 constant LONG_MAX_AGE = 365 days;

    // Seed prices (8 decimals, Chainlink format)
    uint256 constant PRICE_GD   =       1_500_000;   // G$   = $0.015
    uint256 constant PRICE_WETH =   350_000_000_000; // ETH  = $3,500 (3500 * 1e8)
    uint256 constant PRICE_USDC =     100_000_000;   // USDC = $1.00
    uint256 constant PRICE_WBTC = 8_500_000_000_000; // WBTC = $85,000

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        vm.startBroadcast(pk);

        // ── 1. Deactivate old wrong-address tokens ──────────────────────────────
        ORACLE.removeToken(OLD_GDT);
        ORACLE.removeToken(OLD_UBI_AS_WETH);
        ORACLE.removeToken(VSTAKING_AS_USDC);
        ORACLE.removeToken(WBTC_MOCK);
        ORACLE.removeToken(OLD_GDT2);
        console.log("Deactivated 5 wrong/stale tokens");

        // ── 2. Set long defaultMaxAge (no keeper on devnet) ────────────────────
        ORACLE.setDefaultMaxAge(LONG_MAX_AGE);
        console.log("Set defaultMaxAge to 365 days");

        // ── 3. Register correct tokens ─────────────────────────────────────────
        ORACLE.registerToken(NEW_GDT,   "G$",   18, LONG_MAX_AGE);
        ORACLE.registerToken(SWAP_GD,   "SwapGD",  18, LONG_MAX_AGE);
        ORACLE.registerToken(SWAP_WETH, "WETH", 18, LONG_MAX_AGE);
        ORACLE.registerToken(SWAP_USDC, "USDC",  6, LONG_MAX_AGE);
        console.log("Registered 4 correct tokens");

        // ── 4. Seed prices (admin bypass — no deviation guard) ─────────────────
        ORACLE.adminSetPrice(NEW_GDT,   PRICE_GD);
        ORACLE.adminSetPrice(SWAP_GD,   PRICE_GD);
        ORACLE.adminSetPrice(SWAP_WETH, PRICE_WETH);
        ORACLE.adminSetPrice(SWAP_USDC, PRICE_USDC);
        console.log("Seeded fresh prices");

        vm.stopBroadcast();

        console.log("");
        console.log("=== FixSwapPriceOracle Complete ===");
        console.log("Oracle:    0xde2Bd2ffEA002b8E84ADeA96e5976aF664115E2c");
        console.log("New GDT:  ", NEW_GDT);
        console.log("SwapGD:   ", SWAP_GD);
        console.log("SwapWETH: ", SWAP_WETH);
        console.log("SwapUSDC: ", SWAP_USDC);
        console.log("Fixes:     GOO-308");
    }
}
