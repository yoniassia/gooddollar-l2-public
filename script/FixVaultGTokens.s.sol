// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

/**
 * @title FixVaultGTokens — GOO-371: Fix swapped gToken constants in vault strategies
 * @notice The DeployInitialVaults script had G_TOKEN_WETH and G_TOKEN_USDC constants swapped,
 *         causing the ETH-Lending strategy to read USDC gToken balance (always 0) instead of
 *         WETH gToken balance. This made GoodVault deposits succeed but totalAssets() return 0.
 *
 * Fix applied via anvil_setStorageAt for devnet (slot 2 = gToken in LendingStrategy).
 * For the G$-Lending vault, the gToken constant was also wrong — it pointed to gUSDC instead of
 * the G$ gToken (which doesn't exist yet in GoodLend). That vault is left as-is until G$ is
 * added as a GoodLend reserve.
 *
 * Also patches GoodLendPool bytecode via anvil_setCode to include the 3-arg supply/withdraw
 * overloads added in GOO-370 (supply(asset,amount,onBehalfOf) + withdraw(asset,amount,to)).
 *
 * Run: This is documentation only. Fixes applied via cast/curl in the build session.
 */
contract FixVaultGTokens is Script {
    // Correct mapping:
    //   gUSDC = 0x4631BCAbD6dF18D94796344963cB60d44a4136b6
    //   gWETH = 0xA4899D35897033b927acFCf422bc745916139776
    //
    // Was swapped in DeployInitialVaults.s.sol — fixed in same commit.

    function run() external {
        // This script is a no-op; fixes were applied via anvil RPC calls.
        // Kept for audit trail.
    }
}
