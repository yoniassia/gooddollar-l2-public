// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/yield/GoodVault.sol";
import "../src/yield/VaultFactory.sol";
import "../src/yield/strategies/LendingStrategy.sol";

/**
 * @title FixLendingStrategyVault
 * @notice Fixes GOO-324: All 4 GoodVaults share a single LendingStrategy that was
 *         deployed with `_vault = address(0)`, causing every deposit to revert with
 *         NotVault() (selector 0x62df0545).
 *
 * Root cause: DeployInitialVaults created strategies with a placeholder vault address
 * (address(0)) and never wired the real vault addresses after createVault returned.
 *
 * Two-step fix (devnet / anvil only):
 *   Step 1 — script/fix_vault_admin.py:
 *     Override vault admin storage slots (slot 7) from VaultFactory B to deployer
 *     using `anvil_setStorageAt` JSON-RPC. Requires anvil node access.
 *   Step 2 — this script:
 *     Deploy 4 new LendingStrategy instances (one per vault) with correct vault
 *     address, approve them in VaultFactory, and migrate each vault.
 *
 * Run order:
 *   python3 script/fix_vault_admin.py
 *   forge script script/FixLendingStrategyVault.s.sol --rpc-url http://localhost:8545 --broadcast
 *
 * Preconditions verified on devnet (chain 42069):
 *   - Broken strategy: vault()=0x0, asset=0x6533158b (G$)
 *   - All 4 vaults: totalDebt=0, so migrateStrategy skips emergencyWithdraw
 *   - VaultFactory B admin = deployer (default anvil key)
 *   - After running fix_vault_admin.py: vault.admin() = deployer
 *
 * Permanent fix (prevents recurrence):
 *   LendingStrategy + StablecoinStrategy now have setVault(address) one-shot setter.
 *   DeployInitialVaults calls strategy.setVault(vaultAddr) after createVault().
 */
contract FixLendingStrategyVault is Script {

    // ─── Affected VaultFactory (contains the 4 broken vaults) ──────────────
    address constant FACTORY_B    = 0x77AD263Cd578045105FBFC88A477CAd808d39Cf6;

    // ─── Broken shared strategy (vault=address(0)) ──────────────────────────
    address constant BAD_STRATEGY = 0xd977422c9eE9B646f64A4C4389a6C98ad356d8C4;

    // ─── Strategy constructor params (read from devnet state) ───────────────
    address constant ASSET        = 0x6533158b042775e2FdFeF3cA1a782EFDbB8EB9b1; // G$
    address constant LEND_POOL    = 0xdB012DD3E3345e2f8D23c0F3cbCb2D94f430Be8C;
    address constant G_TOKEN      = 0x532802f2F9E0e3EE9d5Ba70C35E1F43C0498772D;

    // ─── The 4 broken GoodVaults ─────────────────────────────────────────────
    address constant VAULT_0 = 0x3b21b7B09dd61e8cd9580ef516b3BBB80E8bf19F;
    address constant VAULT_1 = 0xe3973b9dAB8212e208612B435fEEad084D71FFF1;
    address constant VAULT_2 = 0xA38995cFe225BEA5508D379e61099927eA2270c7;
    address constant VAULT_3 = 0x47627C9aBDdBcdE5f78beE76Ec7Cb8E933c26218;

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(pk);

        address[4] memory vaults = [VAULT_0, VAULT_1, VAULT_2, VAULT_3];

        // Verify prerequisite: fix_vault_admin.py must have been run first
        for (uint256 i = 0; i < 4; i++) {
            require(
                GoodVault(vaults[i]).admin() == deployer,
                "Run fix_vault_admin.py first to override vault admin slots"
            );
        }

        vm.startBroadcast(pk);

        // ── Step 1: Deploy one dedicated LendingStrategy per vault ──────────
        LendingStrategy[4] memory strategies;
        for (uint256 i = 0; i < 4; i++) {
            strategies[i] = new LendingStrategy(ASSET, LEND_POOL, G_TOKEN, vaults[i]);
            require(strategies[i].vault() == vaults[i], "strategy vault mismatch");
            console.log("New strategy[%d]:", i, address(strategies[i]));
        }

        // ── Step 2: Approve new strategies in VaultFactory ──────────────────
        for (uint256 i = 0; i < 4; i++) {
            VaultFactory(FACTORY_B).approveStrategy(address(strategies[i]));
        }

        // ── Step 3: Migrate each vault to its dedicated strategy ─────────────
        // GoodVault.migrateStrategy is onlyAdmin — admin is now deployer (set by fix_vault_admin.py)
        // Each vault has totalDebt=0 so no emergencyWithdraw is triggered.
        for (uint256 i = 0; i < 4; i++) {
            GoodVault(vaults[i]).migrateStrategy(address(strategies[i]));
            require(
                GoodVault(vaults[i]).strategy() == address(strategies[i]),
                "migration failed"
            );
            console.log("vault[%d] migrated to dedicated strategy", i);
        }

        vm.stopBroadcast();

        // ── Summary ──────────────────────────────────────────────────────────
        console.log("");
        console.log("=== FixLendingStrategyVault Complete ===");
        console.log("Factory:      ", FACTORY_B);
        console.log("Bad strategy: ", BAD_STRATEGY);
        for (uint256 i = 0; i < 4; i++) {
            address strat = GoodVault(vaults[i]).strategy();
            address sv = LendingStrategy(strat).vault();
            console.log("vault[%d]:", i, vaults[i]);
            console.log("  strategy:", strat);
            console.log("  strategy.vault():", sv);
        }
        console.log("Fixes: GOO-324");
    }
}
