// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CollateralJoin
 * @notice Adapter to deposit/withdraw ERC-20 collateral into the GoodStable system.
 *         Inspired by MakerDAO's GemJoin. Each collateral type gets its own Join adapter.
 *         
 *         Supports:
 *         - Standard ERC-20 tokens (ETH via WETH, USDC, G$)
 *         - Decimal normalization (USDC = 6 decimals → internal 18)
 *         - Emergency cage (disable new deposits)
 */
contract CollateralJoin is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // --- State ---
    IERC20 public immutable gem;         // The collateral token
    bytes32 public immutable ilk;        // Collateral type identifier
    uint8 public immutable gemDecimals;  // Token's native decimals
    bool public live;                    // Active flag (false = caged)

    /// @notice CDPManager address — the only contract that can trigger internal accounting
    address public cdpManager;

    /// @notice Internal collateral balances (normalized to 18 decimals)
    mapping(address => uint256) public balances;

    /// @notice Total collateral deposited
    uint256 public totalDeposited;

    // --- Events ---
    event Join(address indexed usr, uint256 amount, uint256 normalizedAmount);
    event Exit(address indexed usr, uint256 amount, uint256 normalizedAmount);
    event Cage();
    event CDPManagerSet(address indexed cdpManager);

    // --- Errors ---
    error NotLive();
    error NotAuthorized();
    error ZeroAmount();

    constructor(bytes32 _ilk, address _gem) Ownable() {
        ilk = _ilk;
        gem = IERC20(_gem);
        gemDecimals = _getDecimals(_gem);
        live = true;
    }

    modifier whenLive() {
        if (!live) revert NotLive();
        _;
    }

    modifier onlyCDPManager() {
        if (msg.sender != cdpManager) revert NotAuthorized();
        _;
    }

    /**
     * @notice Set the CDPManager address (can only be set by owner)
     */
    function setCDPManager(address _cdpManager) external onlyOwner {
        cdpManager = _cdpManager;
        emit CDPManagerSet(_cdpManager);
    }

    /**
     * @notice Deposit collateral into the system
     * @param usr  Address to credit in internal accounting
     * @param amount Amount in the token's native decimals
     */
    function join(address usr, uint256 amount) external nonReentrant whenLive {
        if (amount == 0) revert ZeroAmount();

        // Transfer tokens from sender
        gem.safeTransferFrom(msg.sender, address(this), amount);

        // Normalize to 18 decimals for internal accounting
        uint256 normalized = _normalize(amount);

        balances[usr] += normalized;
        totalDeposited += normalized;

        emit Join(usr, amount, normalized);
    }

    /**
     * @notice Withdraw collateral from the system
     * @dev    Called by CDPManager when user withdraws collateral from a vault
     * @param usr     Address whose balance to debit
     * @param to      Address to send tokens to
     * @param amount  Amount in 18-decimal internal units
     */
    function exit(address usr, address to, uint256 amount) external nonReentrant onlyCDPManager {
        if (amount == 0) revert ZeroAmount();

        balances[usr] -= amount;  // Will revert on underflow
        totalDeposited -= amount;

        // Denormalize back to token's native decimals
        uint256 denormalized = _denormalize(amount);

        gem.safeTransfer(to, denormalized);

        emit Exit(usr, denormalized, amount);
    }

    /**
     * @notice Internal transfer of collateral balance (used during liquidation)
     * @param from   Source address
     * @param to     Destination address
     * @param amount Amount in 18 decimals
     */
    function move(address from, address to, uint256 amount) external onlyCDPManager {
        balances[from] -= amount;
        balances[to] += amount;
    }

    /**
     * @notice Emergency shutdown — prevent new deposits
     */
    function cage() external onlyOwner {
        live = false;
        emit Cage();
    }

    // --- Internal helpers ---

    function _normalize(uint256 amount) internal view returns (uint256) {
        if (gemDecimals < 18) {
            return amount * 10 ** (18 - gemDecimals);
        } else if (gemDecimals > 18) {
            return amount / 10 ** (gemDecimals - 18);
        }
        return amount;
    }

    function _denormalize(uint256 amount) internal view returns (uint256) {
        if (gemDecimals < 18) {
            return amount / 10 ** (18 - gemDecimals);
        } else if (gemDecimals > 18) {
            return amount * 10 ** (gemDecimals - 18);
        }
        return amount;
    }

    function _getDecimals(address token) internal view returns (uint8) {
        // Try to call decimals() — default to 18 if it fails
        (bool success, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        if (success && data.length >= 32) {
            return abi.decode(data, (uint8));
        }
        return 18;
    }
}
