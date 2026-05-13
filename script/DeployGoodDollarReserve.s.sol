// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/lending/GoodLendPool.sol";
import "../src/lending/GoodLendToken.sol";
import "../src/lending/DebtToken.sol";

/**
 * @title DeployGoodDollarReserve
 * @notice Deploy and initialize GoodDollar (G$) reserve in GoodLendPool for GOO-505.
 *
 * This script:
 *   1. Deploys gGoodDollar (GoodLendToken) for G$
 *   2. Deploys dGoodDollar (DebtToken) for G$
 *   3. Initializes G$ reserve in GoodLendPool with proper parameters
 *   4. Sets oracle price for G$ (if oracle supports it)
 *   5. Configures interest rate model for G$ (if needed)
 *
 * Usage:
 *   forge script script/DeployGoodDollarReserve.s.sol \
 *     --rpc-url http://localhost:8545 --broadcast --legacy
 *
 * Environment variables:
 *   PRIVATE_KEY           - Deployer private key (defaults to anvil key)
 *   GOOD_DOLLAR_TOKEN     - G$ token address (defaults to known address)
 *   GOOD_LEND_POOL        - Pool address (defaults to deployed address)
 *   PRICE_ORACLE          - Oracle address (defaults to deployed address)
 *   INTEREST_RATE_MODEL   - Rate model address (defaults to deployed address)
 */
contract DeployGoodDollarReserve is Script {

    // Known deployment addresses (from DeployGoodLend broadcast)
    address constant DEFAULT_POOL = 0x49fd2BE640DB2910c2fAb69bB8531Ab6E76127ff;
    address constant DEFAULT_ORACLE = 0x46b142DD1E924FAb83eCc3c08E4D46e82f005e0e;
    address constant DEFAULT_RATE_MODEL = 0x367761085BF3c12E5DA2df99aC6E1a824612B8fB;
    address constant DEFAULT_GD_TOKEN = 0x6533158b042775e2FdFeF3cA1a782EFDbB8EB9b1;

    // G$ reserve parameters (conservative settings)
    uint256 constant RESERVE_FACTOR_BPS = 3000;      // 30% reserve factor
    uint256 constant LTV_BPS = 5000;                 // 50% LTV (conservative)
    uint256 constant LIQ_THRESHOLD_BPS = 6000;       // 60% liquidation threshold
    uint256 constant LIQ_BONUS_BPS = 11000;          // 10% liquidation bonus
    uint256 constant SUPPLY_CAP = 100_000_000;       // 100M G$ supply cap
    uint256 constant BORROW_CAP = 50_000_000;        // 50M G$ borrow cap
    uint8 constant GD_DECIMALS = 18;                 // G$ has 18 decimals

    // Oracle price for G$ (in 8 decimals): $0.001 = 100,000
    uint256 constant GD_PRICE_USD = 100_000;         // $0.001

    interface ISimplePriceOracle {
        function setAssetPrice(address asset, uint256 price) external;
        function getAssetPrice(address asset) external view returns (uint256);
        function admin() external view returns (address);
    }

    interface IInterestRateModel {
        function setRateParams(
            address asset,
            uint256 optimalUtilizationRate,
            uint256 baseRate,
            uint256 slope1,
            uint256 slope2
        ) external;
        function admin() external view returns (address);
    }

    function run() external {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        address gdToken = vm.envOr("GOOD_DOLLAR_TOKEN", DEFAULT_GD_TOKEN);
        address pool = vm.envOr("GOOD_LEND_POOL", DEFAULT_POOL);
        address oracle = vm.envOr("PRICE_ORACLE", DEFAULT_ORACLE);
        address rateModel = vm.envOr("INTEREST_RATE_MODEL", DEFAULT_RATE_MODEL);

        console.log("=== Deploying GoodDollar Reserve (GOO-505) ===");
        console.log("Deployer:", deployer);
        console.log("GoodDollar token:", gdToken);
        console.log("GoodLendPool:", pool);
        console.log("Oracle:", oracle);
        console.log("Rate model:", rateModel);

        vm.startBroadcast(deployerKey);

        // 1. Check if reserve already exists
        bool reserveExists = checkReserveExists(pool, gdToken);
        if (reserveExists) {
            console.log("WARNING: GoodDollar reserve already exists!");
            console.log("Use FixGoodLendReserves.s.sol to reactivate if needed");
            vm.stopBroadcast();
            return;
        }

        // 2. Deploy gGoodDollar (GoodLendToken)
        console.log("\n--- Deploying gGoodDollar ---");
        GoodLendToken gGoodDollar = new GoodLendToken(
            pool,
            gdToken,
            "GoodLend GoodDollar",
            "gG$"
        );
        console.log("gGoodDollar deployed:", address(gGoodDollar));

        // 3. Deploy dGoodDollar (DebtToken)
        console.log("\n--- Deploying dGoodDollar ---");
        DebtToken dGoodDollar = new DebtToken(
            pool,
            gdToken,
            "GoodLend Debt GoodDollar",
            "dG$"
        );
        console.log("dGoodDollar deployed:", address(dGoodDollar));

        // 4. Initialize G$ reserve in pool
        console.log("\n--- Initializing GoodDollar Reserve ---");
        try GoodLendPool(pool).initReserve(
            gdToken,
            address(gGoodDollar),
            address(dGoodDollar),
            RESERVE_FACTOR_BPS,
            LTV_BPS,
            LIQ_THRESHOLD_BPS,
            LIQ_BONUS_BPS,
            SUPPLY_CAP,
            BORROW_CAP,
            GD_DECIMALS
        ) {
            console.log("✓ Reserve initialized successfully");
            console.log("  Supply cap:", SUPPLY_CAP, "G$");
            console.log("  Borrow cap:", BORROW_CAP, "G$");
            console.log("  LTV:", LTV_BPS / 100, "%");
            console.log("  Liq threshold:", LIQ_THRESHOLD_BPS / 100, "%");
        } catch Error(string memory reason) {
            console.log("✗ Reserve initialization failed:", reason);
            vm.stopBroadcast();
            return;
        }

        // 5. Set oracle price for G$
        console.log("\n--- Setting Oracle Price ---");
        try ISimplePriceOracle(oracle).setAssetPrice(gdToken, GD_PRICE_USD) {
            console.log("✓ Oracle price set: $0.001 (100,000 in 8-decimal format)");
        } catch Error(string memory reason) {
            console.log("⚠  Oracle price setting failed:", reason);
            console.log("   May need admin permissions or different oracle interface");
        }

        // 6. Configure interest rate model for G$
        console.log("\n--- Configuring Interest Rate Model ---");
        try IInterestRateModel(rateModel).setRateParams(
            gdToken,
            0.80e27,    // 80% optimal utilization
            0.01e27,    // 1% base rate
            0.05e27,    // 5% slope1
            1.00e27     // 100% slope2 (high to discourage over-utilization)
        ) {
            console.log("✓ Interest rate model configured");
            console.log("  Optimal utilization: 80%");
            console.log("  Base rate: 1%");
            console.log("  Slope 1: 5%");
            console.log("  Slope 2: 100%");
        } catch Error(string memory reason) {
            console.log("⚠  Rate model configuration failed:", reason);
            console.log("   May need admin permissions");
        }

        console.log("\n=== Summary ===");
        console.log("gGoodDollar (gG$):", address(gGoodDollar));
        console.log("dGoodDollar (dG$):", address(dGoodDollar));
        console.log("GoodDollar reserve: INITIALIZED");
        console.log("");
        console.log("✅ GoodDollar can now be supplied/withdrawn from GoodLendPool!");
        console.log("");
        console.log("Next steps:");
        console.log("1. Run verification: python3 verify_goodlend_gooddollar.py");
        console.log("2. Test supply: use frontend or direct contract calls");

        vm.stopBroadcast();
    }

    /**
     * @dev Check if a reserve already exists for the given asset
     */
    function checkReserveExists(address pool, address asset) internal view returns (bool) {
        try GoodLendPool(pool).getReservesCount() returns (uint256 count) {
            for (uint256 i = 0; i < count; i++) {
                try GoodLendPool(pool).reservesList(i) returns (address reserveAsset) {
                    if (reserveAsset == asset) {
                        return true;
                    }
                } catch {
                    continue;
                }
            }
            return false;
        } catch {
            return false; // Assume doesn't exist if we can't check
        }
    }
}