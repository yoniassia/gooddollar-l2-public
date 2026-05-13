// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/swap/GoodSwapRouter.sol";
import "../src/stocks/SyntheticAssetFactory.sol";
import "../src/stocks/CollateralVault.sol";

/**
 * @title RedeployUnverified
 * @notice Redeploys contracts whose on-chain bytecode diverged from current source,
 *         enabling Blockscout source verification. VaultManager is deployed via
 *         a second script (RedeployVaultManager) to avoid interface collisions.
 *
 *         NOTE: ConditionalTokens is NOT deployed here. CT is deployed exclusively
 *         by MarketFactory's constructor — deploying it standalone creates orphan
 *         instances that fragment the prediction market state (GOO-311).
 *         To get a fresh CT, redeploy MarketFactory via RedeployPredict.s.sol.
 */
contract RedeployUnverified is Script {
    address constant ADMIN           = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address constant GOOD_DOLLAR     = 0x6533158b042775e2FdFeF3cA1a782EFDbB8EB9b1;
    address constant UBI_FEE_SPLITTER= 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;
    address constant STOCKS_ORACLE   = 0xD0141E899a65C95a556fE2B27e5982A6DE7fDD7A;

    // Swap pools
    address constant POOL_GD_WETH    = 0xA4899D35897033b927acFCf422bc745916139776;
    address constant POOL_GD_USDC    = 0xf953b3A269d80e3eB0F2947630Da976B896A8C5b;
    address constant POOL_WETH_USDC  = 0xAA292E8611aDF267e563f334Ee42320aC96D0463;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        // 1. GoodSwapRouter
        GoodSwapRouter router = new GoodSwapRouter(ADMIN);
        console.log("GoodSwapRouter:", address(router));
        router.registerPool(POOL_GD_WETH);
        router.registerPool(POOL_GD_USDC);
        router.registerPool(POOL_WETH_USDC);

        // 2. SyntheticAssetFactory
        SyntheticAssetFactory saf = new SyntheticAssetFactory(ADMIN);
        console.log("SyntheticAssetFactory:", address(saf));

        // 3. CollateralVault
        CollateralVault cv = new CollateralVault(
            GOOD_DOLLAR, STOCKS_ORACLE, UBI_FEE_SPLITTER, ADMIN
        );
        console.log("CollateralVault:", address(cv));

        vm.stopBroadcast();
    }
}
