// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/UBIFeeSplitter.sol";
import "../src/swap/LiFiBridgeAggregator.sol";

/**
 * @title RedeployUBIAndLiFi
 * @notice Redeploys UBIFeeSplitter (with receive() + ubiRecipient fix) and
 *         LiFiBridgeAggregator.
 *
 * Required because the previously deployed UBIFeeSplitter at 0xe7f1725E...
 * was deployed before:
 *   1. receive() was added — causing initiateSwapETH to fail when routing ETH fees
 *   2. ubiRecipient = _treasury was set in the constructor — causing
 *      claimableBalance() to revert and splitFeeToken() to fail (GOO-196)
 *
 * After running this script:
 *   1. Update op-stack/addresses.json: UBIFeeSplitter → new address
 *   2. Update frontend/src/lib/devnet.ts: UBIFeeSplitter → new address
 *   3. Call setFeeBeneficiary(newSplitter) on each GoodPool
 *      - SwapPoolGdWeth:  0xA4899D35897033b927acFCf422bc745916139776
 *      - SwapPoolGdUsdc:  0xf953b3A269d80e3eB0F2947630Da976B896A8C5b
 *      - SwapPoolWethUsdc: 0xAA292E8611aDF267e563f334Ee42320aC96D0463
 *   4. Call setUBIRecipient(ubiClaimV2Address) on the new splitter
 *      so splitFeeToken() routes non-G$ UBI shares to the right destination
 *      instead of falling back to the deployer address.
 *
 * Usage (devnet):
 *   PRIVATE_KEY=<key> GOOD_DOLLAR_TOKEN=0x5FbDB2315678afecb367f032d93F642f64180aa3 \
 *   UBI_CLAIM_V2=<address> \
 *     forge script script/RedeployUBIAndLiFi.s.sol \
 *     --rpc-url $DEVNET_RPC --broadcast --legacy
 */
contract RedeployUBIAndLiFi is Script {
    // ── Token addresses (devnet) ──────────────────────────────────────────────
    address constant GDOLLAR  = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    address constant MOCK_WETH = 0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1;
    address constant MOCK_USDC = 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0;
    address constant MOCK_WBTC = 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9;

    // ── GoodPool addresses (need feeBeneficiary update) ───────────────────────
    address constant POOL_GD_WETH   = 0xA4899D35897033b927acFCf422bc745916139776;
    address constant POOL_GD_USDC   = 0xf953b3A269d80e3eB0F2947630Da976B896A8C5b;
    address constant POOL_WETH_USDC = 0xAA292E8611aDF267e563f334Ee42320aC96D0463;

    function run() external {
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerKey);

        address gdollar = vm.envOr("GOOD_DOLLAR_TOKEN", GDOLLAR);

        // UBIClaimV2 address — override via env; required for setUBIRecipient to be
        // meaningful. Falls back to deployer so the deploy doesn't revert on devnet.
        address ubiClaimV2 = vm.envOr("UBI_CLAIM_V2", deployer);

        vm.startBroadcast(deployerKey);

        // 1. Deploy new UBIFeeSplitter (with receive() and ubiRecipient fix).
        //    Constructor sets ubiRecipient = deployer as an interim fallback.
        UBIFeeSplitter splitter = new UBIFeeSplitter(gdollar, deployer, deployer);
        console.log("UBIFeeSplitter (new):", address(splitter));

        // 2. Set the real UBI recipient so splitFeeToken() routes non-G$ UBI shares
        //    to UBIClaimV2 instead of the deployer (fixes GOO-196).
        splitter.setUBIRecipient(ubiClaimV2);
        console.log("ubiRecipient set to:", ubiClaimV2);

        // 3. Deploy LiFiBridgeAggregator with correct addresses
        LiFiBridgeAggregator lifi = new LiFiBridgeAggregator(deployer, address(splitter));
        console.log("LiFiBridgeAggregator (new):", address(lifi));

        // 4. Whitelist tokens
        address[] memory tokens = new address[](4);
        tokens[0] = gdollar;
        tokens[1] = MOCK_WETH;
        tokens[2] = MOCK_USDC;
        tokens[3] = MOCK_WBTC;
        lifi.batchWhitelistTokens(tokens);
        console.log("Whitelisted 4 tokens: G$, WETH, USDC, WBTC");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Redeployment Complete ===");
        console.log("New UBIFeeSplitter:", address(splitter));
        console.log("New LiFiBridgeAggregator:", address(lifi));
        console.log("");
        console.log("TODO: Update op-stack/addresses.json and devnet.ts");
        console.log("TODO: Call setFeeBeneficiary(newSplitter) on each GoodPool:");
        console.log("  GoodPool G$/WETH  :", POOL_GD_WETH);
        console.log("  GoodPool G$/USDC  :", POOL_GD_USDC);
        console.log("  GoodPool WETH/USDC:", POOL_WETH_USDC);
    }
}
