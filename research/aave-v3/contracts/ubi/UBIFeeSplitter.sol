// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {IERC20} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/IERC20.sol";
import {GPv2SafeERC20} from "@aave/core-v3/contracts/dependencies/gnosis/contracts/GPv2SafeERC20.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";

/**
 * @title UBIFeeSplitter
 * @notice Receives protocol revenue (as ATokens) and splits between UBI pool and protocol treasury
 * @dev Set as the `_treasury` address on all GoodLend ATokens
 *
 * Flow:
 *   1. Aave accrues interest → ATokens minted to this contract (via AToken.mintToTreasury)
 *   2. Anyone calls distribute(asset) → redeems ATokens → splits underlying
 *   3. ubiBps% → UBI recipient (GoodDollar UBIScheme or staking contract)
 *   4. remainder → protocol treasury (DAO multisig)
 */
contract UBIFeeSplitter {
    using GPv2SafeERC20 for IERC20;

    /// @notice The Aave Pool (for withdrawing underlying from ATokens)
    IPool public immutable POOL;

    /// @notice Basis points sent to UBI (3333 = 33.33%)
    uint256 public ubiBps;

    /// @notice Max UBI split (50%)
    uint256 public constant MAX_UBI_BPS = 5000;

    /// @notice BPS denominator
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Address receiving UBI portion (GoodDollar UBIScheme)
    address public ubiRecipient;

    /// @notice Address receiving protocol portion (DAO treasury)
    address public protocolTreasury;

    /// @notice Admin (initially deployer, later DAO)
    address public admin;

    /// @notice Total distributed per asset (for tracking)
    mapping(address => uint256) public totalDistributed;
    mapping(address => uint256) public totalToUBI;

    event Distributed(
        address indexed asset,
        uint256 totalAmount,
        uint256 ubiAmount,
        uint256 treasuryAmount
    );
    event UBIBpsUpdated(uint256 oldBps, uint256 newBps);
    event UBIRecipientUpdated(address oldRecipient, address newRecipient);
    event ProtocolTreasuryUpdated(address oldTreasury, address newTreasury);
    event AdminTransferred(address oldAdmin, address newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "UBIFeeSplitter: not admin");
        _;
    }

    constructor(
        IPool pool,
        address _ubiRecipient,
        address _protocolTreasury,
        uint256 _ubiBps
    ) {
        require(address(pool) != address(0), "UBIFeeSplitter: zero pool");
        require(_ubiRecipient != address(0), "UBIFeeSplitter: zero ubi");
        require(_protocolTreasury != address(0), "UBIFeeSplitter: zero treasury");
        require(_ubiBps <= MAX_UBI_BPS, "UBIFeeSplitter: bps too high");

        POOL = pool;
        ubiRecipient = _ubiRecipient;
        protocolTreasury = _protocolTreasury;
        ubiBps = _ubiBps;
        admin = msg.sender;
    }

    /**
     * @notice Distribute accumulated AToken fees for a given underlying asset
     * @param asset The underlying asset address (e.g., USDC, not aUSDC)
     * @dev Anyone can call this — it's permissionless distribution
     */
    function distribute(address asset) external {
        DataTypes.ReserveData memory reserve = POOL.getReserveData(asset);
        address aTokenAddress = reserve.aTokenAddress;
        require(aTokenAddress != address(0), "UBIFeeSplitter: unknown asset");

        uint256 aTokenBalance = IERC20(aTokenAddress).balanceOf(address(this));
        if (aTokenBalance == 0) return;

        // Withdraw underlying from Pool (burns our ATokens)
        uint256 withdrawn = POOL.withdraw(asset, type(uint256).max, address(this));

        // Calculate split
        uint256 ubiAmount = (withdrawn * ubiBps) / BPS_DENOMINATOR;
        uint256 treasuryAmount = withdrawn - ubiAmount;

        // Transfer
        if (ubiAmount > 0) {
            IERC20(asset).safeTransfer(ubiRecipient, ubiAmount);
        }
        if (treasuryAmount > 0) {
            IERC20(asset).safeTransfer(protocolTreasury, treasuryAmount);
        }

        // Track
        totalDistributed[asset] += withdrawn;
        totalToUBI[asset] += ubiAmount;

        emit Distributed(asset, withdrawn, ubiAmount, treasuryAmount);
    }

    /**
     * @notice Distribute fees for multiple assets at once
     * @param assets Array of underlying asset addresses
     */
    function distributeMultiple(address[] calldata assets) external {
        for (uint256 i = 0; i < assets.length; i++) {
            this.distribute(assets[i]);
        }
    }

    // --- Admin functions ---

    function setUBIBps(uint256 newBps) external onlyAdmin {
        require(newBps <= MAX_UBI_BPS, "UBIFeeSplitter: bps too high");
        emit UBIBpsUpdated(ubiBps, newBps);
        ubiBps = newBps;
    }

    function setUBIRecipient(address newRecipient) external onlyAdmin {
        require(newRecipient != address(0), "UBIFeeSplitter: zero address");
        emit UBIRecipientUpdated(ubiRecipient, newRecipient);
        ubiRecipient = newRecipient;
    }

    function setProtocolTreasury(address newTreasury) external onlyAdmin {
        require(newTreasury != address(0), "UBIFeeSplitter: zero address");
        emit ProtocolTreasuryUpdated(protocolTreasury, newTreasury);
        protocolTreasury = newTreasury;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "UBIFeeSplitter: zero address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    function rescue(address token, uint256 amount, address to) external onlyAdmin {
        IERC20(token).safeTransfer(to, amount);
    }
}
