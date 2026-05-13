// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IGDT {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IVeGD {
    function lock(uint256 amount, uint256 duration) external;
    function totalSupply() external view returns (uint256);
}

/**
 * @title SeedVeGD
 * @notice Locks deployer GDT into VoteEscrowedGD so governance quorum can be met.
 *
 * Background (GOO-486):
 *   VoteEscrowedGD.totalSupply()=0 after redeployment (GOO-475). No GDT has been
 *   locked. GoodDAO quorum requires totalSupply > 0. Without any locked GDT,
 *   proposals can never pass quorum check in GoodDAO.
 *
 * Fix:
 *   Lock 1M GDT (1e24) with a 1-year duration from the deployer wallet.
 *   This seeds voting power for governance devnet testing.
 *
 * Usage (devnet):
 *   forge script script/SeedVeGD.s.sol \
 *     --rpc-url http://localhost:8545 --broadcast --legacy
 */
contract SeedVeGD is Script {
    address constant GDT    = 0x36C02dA8a0983159322a80FFE9F24b1acfF8B570;
    address constant VEGD   = 0x8B64968F69E669faCc86FA3484FD946f1bBE7c91;

    uint256 constant LOCK_AMOUNT   = 1_000_000 * 1e18; // 1M GDT
    uint256 constant LOCK_DURATION = 365 days;          // 1 year

    function run() external {
        uint256 pk = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(pk);

        IGDT gdt = IGDT(GDT);
        IVeGD veGD = IVeGD(VEGD);

        uint256 balance = gdt.balanceOf(deployer);
        console.log("Deployer GDT balance:", balance / 1e18, "GDT");
        require(balance >= LOCK_AMOUNT, "SeedVeGD: insufficient GDT balance");

        vm.startBroadcast(pk);

        gdt.approve(VEGD, LOCK_AMOUNT);
        veGD.lock(LOCK_AMOUNT, LOCK_DURATION);

        vm.stopBroadcast();

        uint256 totalSupply = veGD.totalSupply();
        console.log("veGD.totalSupply() after lock:", totalSupply);
        console.log("=== SeedVeGD complete ===");
        console.log("Locked", LOCK_AMOUNT / 1e18, "GDT for 1 year from", deployer);
        console.log("Governance quorum is now achievable.");
    }
}
