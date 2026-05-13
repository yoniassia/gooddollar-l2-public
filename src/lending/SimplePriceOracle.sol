// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SimplePriceOracle
 * @notice Admin-settable price oracle for GoodLend devnet.
 *         Prices are in USD with 8 decimals (e.g., 1 USD = 1e8, 1 ETH = 2000e8).
 *         In production, replace with Pyth/Chainlink adapters.
 */
contract SimplePriceOracle {
    mapping(address => uint256) public prices; // asset → USD price (8 decimals)
    address public admin;

    event PriceSet(address indexed asset, uint256 price);

    modifier onlyAdmin() {
        require(msg.sender == admin, "SimplePriceOracle: not admin");
        _;
    }

    constructor(address _admin) {
        admin = _admin;
    }

    function setAssetPrice(address asset, uint256 price) external onlyAdmin {
        prices[asset] = price;
        emit PriceSet(asset, price);
    }

    function setAssetPrices(address[] calldata assets, uint256[] calldata _prices) external onlyAdmin {
        require(assets.length == _prices.length, "length mismatch");
        for (uint256 i = 0; i < assets.length; i++) {
            prices[assets[i]] = _prices[i];
            emit PriceSet(assets[i], _prices[i]);
        }
    }

    function getAssetPrice(address asset) external view returns (uint256) {
        return prices[asset];
    }

    function setAdmin(address _admin) external onlyAdmin {
        admin = _admin;
    }
}
