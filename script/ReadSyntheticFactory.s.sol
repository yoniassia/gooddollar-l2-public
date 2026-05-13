// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface ISyntheticAssetFactory {
    function implementation() external view returns (address);
    function admin() external view returns (address);
    function listedCount() external view returns (uint256);
}

contract ReadSyntheticFactory is Script {
    address constant OLD = 0x610178dA211FEF7D417bC0e6FeD39F05609AD788;
    address constant NEW = 0xd9140951d8aE6E5F625a02F5908535e16e3af964;

    function run() external view {
        console.log("=== OLD (0x610178...) ===");
        _check(OLD);

        console.log("=== NEW/devnet (0xd91409...) ===");
        _check(NEW);
    }

    function _check(address factory) internal view {
        try ISyntheticAssetFactory(factory).admin() returns (address a) {
            console.log("  admin():", a);
        } catch {
            console.log("  admin(): REVERT");
        }
        try ISyntheticAssetFactory(factory).listedCount() returns (uint256 n) {
            console.log("  listedCount():", n);
        } catch {
            console.log("  listedCount(): REVERT");
        }
        try ISyntheticAssetFactory(factory).implementation() returns (address impl) {
            console.log("  implementation():", impl);
        } catch {
            console.log("  implementation(): REVERT");
        }
    }
}
