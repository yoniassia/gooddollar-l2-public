// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IGoodLendPool {
    function initReserve(
        address asset,
        address gToken,
        address debtToken,
        uint256 reserveFactorBPS,
        uint256 ltvBPS,
        uint256 liquidationThresholdBPS,
        uint256 liquidationBonusBPS,
        uint256 supplyCap,
        uint256 borrowCap,
        uint8   assetDecimals
    ) external;
    function setReserveActive(address asset, bool active) external;
    function getReservesCount() external view returns (uint256);
}

interface IToken {
    function mint(address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title FixGoodLendUSDAReserve
 * @notice Initializes the USDC reserve on the GoodLendPool deployed 2026-04-05.
 *
 *         Run with:
 *           forge script script/FixGoodLendUSDAReserve.s.sol \
 *             --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY
 *
 *         Addresses from broadcast/DeployGoodLend.s.sol/42069/run-latest.json
 */
contract FixGoodLendUSDAReserve is Script {
    // Deployed 2026-04-05 (GOO-388 fix — run-latest.json)
    address constant POOL   = 0x49fd2BE640DB2910c2fAb69bB8531Ab6E76127ff;
    address constant USDC   = 0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5;
    address constant gUSDC  = 0x4631BCAbD6dF18D94796344963cB60d44a4136b6;
    address constant dUSDC  = 0x86A2EE8FAf9A840F7a2c64CA3d51209F9A02081D;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Pool reserves before:", IGoodLendPool(POOL).getReservesCount());

        vm.startBroadcast(deployerKey);

        // Initialize USDC reserve — same params as DeployGoodLend.s.sol
        // Will revert if already initialized; if so, use setReserveActive instead.
        IGoodLendPool(POOL).initReserve(
            USDC, gUSDC, dUSDC,
            2000,      // 20% reserve factor
            8000,      // 80% LTV
            8500,      // 85% liquidation threshold
            10500,     // 5% liquidation bonus
            1_000_000, // 1M USDC supply cap
            800_000,   // 800K USDC borrow cap
            6          // 6 decimals
        );

        console.log("USDC reserve initialized.");
        console.log("Pool reserves after:", IGoodLendPool(POOL).getReservesCount());

        // Seed 1K USDC of initial liquidity so tester can verify supply() works
        uint256 bal = IToken(USDC).balanceOf(deployer);
        if (bal == 0) {
            IToken(USDC).mint(deployer, 10_000e6);
            console.log("Minted 10K test USDC to deployer");
        }
        IToken(USDC).approve(POOL, type(uint256).max);

        // Import the pool supply ABI via low-level call to avoid linking issues
        (bool ok, bytes memory ret) = POOL.call(
            abi.encodeWithSignature("supply(address,uint256)", USDC, 1_000e6)
        );
        require(ok, string(abi.encodePacked("seed supply failed: ", ret)));
        console.log("Seeded 1K USDC into pool - reserve is live.");

        vm.stopBroadcast();
    }
}

/**
 * @title ActivateGoodLendUSDA
 * @notice Fallback: if USDC reserve was already initialized but set inactive,
 *         use this script instead of FixGoodLendUSDAReserve.
 *
 *         forge script script/FixGoodLendUSDAReserve.s.sol:ActivateGoodLendUSDA \
 *           --rpc-url $RPC_URL --broadcast --private-key $PRIVATE_KEY
 */
contract ActivateGoodLendUSDA is Script {
    address constant POOL = 0x49fd2BE640DB2910c2fAb69bB8531Ab6E76127ff;
    address constant USDC = 0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        IGoodLendPool(POOL).setReserveActive(USDC, true);
        console.log("USDC reserve re-activated on pool", POOL);
        vm.stopBroadcast();
    }
}
