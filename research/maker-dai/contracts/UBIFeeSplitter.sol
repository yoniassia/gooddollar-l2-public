// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title UBIFeeSplitter
 * @notice Receives all GoodStable protocol revenue and splits it:
 *         - 33% → UBI Pool (direct GoodDollar UBI distribution)
 *         - 33% → Reserve Fund (protocol safety buffer)  
 *         - 34% → G$ Buyback (buy G$ on market, add to UBI)
 *
 *         This is the core innovation of GoodStable: all protocol surplus
 *         funds Universal Basic Income instead of enriching token holders.
 *
 *         Revenue sources:
 *         - Stability fees (from CDPManager drip)
 *         - Liquidation penalties (surplus from liquidations)
 *         - PSM swap fees
 */
contract UBIFeeSplitter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- State ---
    IERC20 public immutable gUSD;

    address public ubiPool;         // GoodDollar UBI distribution contract
    address public reserveFund;     // Protocol safety reserve
    address public buybackContract; // G$ buyback mechanism

    uint256 public ubiShare;        // Basis points for UBI (3300 = 33%)
    uint256 public reserveShare;    // Basis points for reserve (3300 = 33%)
    // Buyback gets the remainder (10000 - ubiShare - reserveShare)

    uint256 public constant MAX_BPS = 10000;

    /// @notice Total fees received historically
    uint256 public totalFeesReceived;

    /// @notice Total distributed per destination
    uint256 public totalToUBI;
    uint256 public totalToReserve;
    uint256 public totalToBuyback;

    /// @notice Pending fees to be distributed
    uint256 public pendingFees;

    // --- Events ---
    event FeesReceived(uint256 amount, address indexed from);
    event FeesDistributed(uint256 toUBI, uint256 toReserve, uint256 toBuyback);
    event SharesUpdated(uint256 ubiShare, uint256 reserveShare);
    event DestinationsUpdated(address ubiPool, address reserveFund, address buybackContract);

    // --- Errors ---
    error InvalidShares();
    error ZeroAddress();
    error NoPendingFees();

    constructor(
        address _gUSD,
        address _ubiPool,
        address _reserveFund,
        address _buybackContract
    ) Ownable() {
        gUSD = IERC20(_gUSD);
        ubiPool = _ubiPool;
        reserveFund = _reserveFund;
        buybackContract = _buybackContract;

        // Default: 33% UBI, 33% reserve, 34% buyback
        ubiShare = 3300;
        reserveShare = 3300;
    }

    /**
     * @notice Receive fees from CDPManager or other protocol contracts.
     *         Fees accumulate and can be distributed via distribute().
     * @param amount Amount of gUSD received (must already be transferred)
     */
    function receiveFees(uint256 amount) external {
        pendingFees += amount;
        totalFeesReceived += amount;
        emit FeesReceived(amount, msg.sender);
    }

    /**
     * @notice Distribute accumulated fees to UBI, reserve, and buyback.
     *         Anyone can call this — it's permissionless.
     */
    function distribute() external nonReentrant {
        uint256 balance = gUSD.balanceOf(address(this));
        if (balance == 0) revert NoPendingFees();

        uint256 toUBI = balance * ubiShare / MAX_BPS;
        uint256 toReserve = balance * reserveShare / MAX_BPS;
        uint256 toBuyback = balance - toUBI - toReserve;

        if (toUBI > 0 && ubiPool != address(0)) {
            gUSD.safeTransfer(ubiPool, toUBI);
            totalToUBI += toUBI;
        }

        if (toReserve > 0 && reserveFund != address(0)) {
            gUSD.safeTransfer(reserveFund, toReserve);
            totalToReserve += toReserve;
        }

        if (toBuyback > 0 && buybackContract != address(0)) {
            gUSD.safeTransfer(buybackContract, toBuyback);
            totalToBuyback += toBuyback;
        }

        pendingFees = 0;

        emit FeesDistributed(toUBI, toReserve, toBuyback);
    }

    // --- Admin ---

    /**
     * @notice Update fee split ratios
     * @param _ubiShare     UBI share in basis points
     * @param _reserveShare Reserve share in basis points
     */
    function setShares(uint256 _ubiShare, uint256 _reserveShare) external onlyOwner {
        if (_ubiShare + _reserveShare > MAX_BPS) revert InvalidShares();
        ubiShare = _ubiShare;
        reserveShare = _reserveShare;
        emit SharesUpdated(_ubiShare, _reserveShare);
    }

    /**
     * @notice Update destination addresses
     */
    function setDestinations(
        address _ubiPool,
        address _reserveFund,
        address _buybackContract
    ) external onlyOwner {
        ubiPool = _ubiPool;
        reserveFund = _reserveFund;
        buybackContract = _buybackContract;
        emit DestinationsUpdated(_ubiPool, _reserveFund, _buybackContract);
    }

    // --- View ---

    /**
     * @notice Preview how fees would be split at current ratios
     */
    function previewDistribution() external view returns (
        uint256 toUBI,
        uint256 toReserve,
        uint256 toBuyback
    ) {
        uint256 balance = gUSD.balanceOf(address(this));
        toUBI = balance * ubiShare / MAX_BPS;
        toReserve = balance * reserveShare / MAX_BPS;
        toBuyback = balance - toUBI - toReserve;
    }
}
