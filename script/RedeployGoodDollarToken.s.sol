// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/GoodDollarToken.sol";
import "../src/UBIClaimV2.sol";

interface IGoodDollarAdmin {
    function setMinter(address minter, bool authorized) external;
}

/**
 * @title RedeployGoodDollarToken
 * @notice Redeploys GoodDollarToken from current src/GoodDollarToken.sol and
 *         wires UBIClaimV2 with the new address.
 *
 * GOO-238: deployed bytecode at 0x5FbDB2315678afecb367f032d93F642f64180aa3 is
 * an outdated version missing mint/setMinter/minters/isVerifiedHuman.
 *
 * Steps:
 *   1. Deploy fresh GoodDollarToken with 1 billion G$ initial supply.
 *   2. Deploy UBIClaimV2 wired to new GDT + existing UBIFeeSplitter.
 *   3. Grant UBIClaimV2 the minter role on the new GDT.
 *   4. Set deployer as initial trusted relayer on UBIClaimV2.
 *
 * Usage (devnet):
 *   forge script script/RedeployGoodDollarToken.s.sol \
 *     --rpc-url http://localhost:8545 --broadcast
 */
contract RedeployGoodDollarToken is Script {
    address constant ADMIN            = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address constant IDENTITY_ORACLE  = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address constant UBI_FEE_SPLITTER = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;

    uint256 constant INITIAL_SUPPLY   = 1_000_000_000 * 1e18; // 1 billion G$

    function run() external {
        uint256 key = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(key);

        vm.startBroadcast(key);

        // 1. Deploy updated GoodDollarToken
        GoodDollarToken gdt = new GoodDollarToken(
            ADMIN,
            IDENTITY_ORACLE,
            INITIAL_SUPPLY
        );
        console.log("GoodDollarToken (new):", address(gdt));

        // 2. Deploy UBIClaimV2 wired to new GDT
        UBIClaimV2 ubiClaim = new UBIClaimV2(
            address(gdt),
            UBI_FEE_SPLITTER,
            deployer
        );
        console.log("UBIClaimV2:", address(ubiClaim));

        // 3. Grant minter role to UBIClaimV2
        gdt.setMinter(address(ubiClaim), true);
        console.log("Minter role granted to UBIClaimV2");

        // 4. Set deployer as initial trusted relayer
        ubiClaim.setRelayer(deployer, true);
        console.log("Deployer set as trusted relayer:", deployer);

        vm.stopBroadcast();

        console.log("--- Redeployment complete ---");
        console.log("Update op-stack/addresses.json:");
        console.log("  GoodDollarToken:", address(gdt));
        console.log("  UBIClaimV2:", address(ubiClaim));
    }
}
