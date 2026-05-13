// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SyntheticAsset.sol";

/**
 * @title SyntheticAssetFactory
 * @notice Deploys and tracks SyntheticAsset ERC-20 tokens for listed stocks.
 *         Called by the admin (governance) to list new stocks. The vault
 *         address passed at listing time becomes the sole minter.
 * @dev Uses EIP-1167 minimal proxy clones so that listAsset() stays well
 *      under the 500 k-gas default call limit. A single SyntheticAsset
 *      implementation is deployed once in the constructor; every subsequent
 *      listing clones it (~45 bytes) and calls initialize() instead of
 *      deploying a fresh 2 KB contract (~580 k gas → ~170 k gas per listing).
 */
contract SyntheticAssetFactory {
    // ============ State ============

    address public admin;

    /// @notice Shared SyntheticAsset implementation (cloned for each listing)
    address public immutable implementation;

    /// @notice ticker key → SyntheticAsset address
    mapping(bytes32 => address) public assets;

    /// @notice All listed tickers (display/enumeration)
    bytes32[] public listedKeys;
    mapping(bytes32 => string) public keyToTicker;

    // ============ Events ============

    event AssetListed(string indexed ticker, address asset, address vault);
    event AssetDelisted(string indexed ticker, address asset);

    // ============ Errors ============

    error NotAdmin();
    error ZeroAddress();
    error AlreadyListed(string ticker);
    error NotListed(string ticker);
    error CloneFailed();

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ============ Constructor ============

    constructor(address _admin) {
        if (_admin == address(0)) revert ZeroAddress();
        admin = _admin;
        // Deploy the shared implementation once.  minter = address(1) locks it
        // against re-initialization via initialize().
        implementation = address(new SyntheticAsset("", "", address(1)));
    }

    // ============ Listing ============

    /**
     * @notice Deploy a new SyntheticAsset token for a stock.
     * @param ticker Trading symbol (e.g., "AAPL")
     * @param assetName Full name (e.g., "Apple Inc. — Synthetic")
     * @param vault CollateralVault address (will be the sole minter)
     * @return asset Address of the deployed SyntheticAsset
     */
    function listAsset(
        string calldata ticker,
        string calldata assetName,
        address vault
    ) external onlyAdmin returns (address asset) {
        if (vault == address(0)) revert ZeroAddress();
        bytes32 key = _key(ticker);
        if (assets[key] != address(0)) revert AlreadyListed(ticker);

        // Compute syntheticSymbol after _clone to avoid holding an extra stack slot
        // inside _clone's inline assembly (coverage instrumentation adds counters that
        // push the stack close to the 16-slot EVM limit).
        asset = _clone(implementation);
        string memory syntheticSymbol = string(abi.encodePacked("s", ticker));
        SyntheticAsset(asset).initialize(assetName, syntheticSymbol, vault);

        assets[key] = asset;
        listedKeys.push(key);
        keyToTicker[key] = ticker;

        emit AssetListed(ticker, asset, vault);
    }

    /**
     * @notice Remove a stock from the listed set (doesn't destroy the token).
     */
    function delistAsset(string calldata ticker) external onlyAdmin {
        bytes32 key = _key(ticker);
        address asset = assets[key];
        if (asset == address(0)) revert NotListed(ticker);

        delete assets[key];

        // Remove from listedKeys array
        uint256 len = listedKeys.length;
        for (uint256 i = 0; i < len; i++) {
            if (listedKeys[i] == key) {
                listedKeys[i] = listedKeys[len - 1];
                listedKeys.pop();
                break;
            }
        }

        emit AssetDelisted(ticker, asset);
    }

    // ============ View ============

    /**
     * @notice Get asset address by ticker
     */
    function getAsset(string calldata ticker) external view returns (address) {
        return assets[_key(ticker)];
    }

    /**
     * @notice Total number of listed assets
     */
    function listedCount() external view returns (uint256) {
        return listedKeys.length;
    }

    /**
     * @notice Transfer admin
     */
    function setAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        admin = newAdmin;
    }

    // ============ Internal ============

    function _key(string calldata ticker) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(ticker));
    }

    /// @notice Deploy an EIP-1167 minimal proxy pointing at `impl`.
    function _clone(address impl) internal returns (address instance) {
        /// @solidity memory-safe-assembly
        assembly {
            let ptr := mload(0x40)
            // EIP-1167 initcode: 10-byte header + 20-byte address + 15-byte footer
            mstore(ptr,         0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(ptr, 20), shl(96, impl))
            mstore(add(ptr, 40), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create(0, ptr, 55)
        }
        if (instance == address(0)) revert CloneFailed();
    }
}
