// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IFastWithdrawalLP {
    function setUBIPool(address _ubiPool) external;
    function ubiPool() external view returns (address);
    function admin() external view returns (address);
}

/**
 * @title FixFastWithdrawalUBIPool
 * @notice Fix GOO-279: FastWithdrawalLP.ubiPool is set to the deployer EOA
 *         (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266) instead of the UBIFeeSplitter.
 *
 * The FastWithdrawalLP collects 33.33% of every fast-withdrawal fee and forwards it
 * to the ubiPool address via ERC20.transfer(). With ubiPool = deployer EOA, all UBI
 * fees from fast withdrawals have been silently going to the deployer wallet.
 *
 * Fix: call setUBIPool(UBIFeeSplitter) from the admin key.
 *
 * Usage (devnet):
 *   forge script script/FixFastWithdrawalUBIPool.s.sol \
 *     --rpc-url $DEVNET_RPC --broadcast --legacy
 */
contract FixFastWithdrawalUBIPool is Script {
    address constant FAST_WITHDRAWAL_LP = 0xefAB0Beb0A557E452b398035eA964948c750b2Fd;
    address constant UBI_FEE_SPLITTER   = 0xC0BF43A4Ca27e0976195E6661b099742f10507e5;
    address constant DEPLOYER_EOA       = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    function run() external {
        uint256 key = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        vm.startBroadcast(key);

        IFastWithdrawalLP lp = IFastWithdrawalLP(FAST_WITHDRAWAL_LP);

        address before = lp.ubiPool();
        console.log("ubiPool before:", before);
        require(before == DEPLOYER_EOA, "unexpected ubiPool - already fixed or wrong address");

        lp.setUBIPool(UBI_FEE_SPLITTER);

        address after_ = lp.ubiPool();
        console.log("ubiPool after: ", after_);
        require(after_ == UBI_FEE_SPLITTER, "setUBIPool failed");

        vm.stopBroadcast();

        console.log("GOO-279 fixed: FastWithdrawalLP.ubiPool now points to UBIFeeSplitter");
    }
}
