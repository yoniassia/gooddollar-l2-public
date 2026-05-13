// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title UBI Fee Hook for Uniswap V4
 * @notice A Uniswap V4 hook that routes a configurable percentage of swap fees
 *         to the GoodDollar UBI pool. Every swap on GoodSwap funds UBI.
 * @dev Implements afterSwap hook. Uses minimal V4 interfaces to avoid
 *      heavy dependency on full Uniswap V4 core during development.
 */

// ============ Minimal Uniswap V4 Interfaces ============

/// @notice Minimal PoolKey struct matching Uniswap V4
struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

/// @notice Swap parameters
struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified;
    uint160 sqrtPriceLimitX96;
}

/// @notice Balance delta from a swap
struct BalanceDelta {
    int128 amount0;
    int128 amount1;
}

/// @notice Hook permissions bitmap
struct Hooks {
    bool beforeInitialize;
    bool afterInitialize;
    bool beforeAddLiquidity;
    bool afterAddLiquidity;
    bool beforeRemoveLiquidity;
    bool afterRemoveLiquidity;
    bool beforeSwap;
    bool afterSwap;
    bool beforeDonate;
    bool afterDonate;
}

/// @notice Minimal IPoolManager interface
interface IPoolManager {
    function swap(PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        external
        returns (BalanceDelta memory);
}

/// @notice Minimal ERC20 interface for fee token transfers
interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Interface for the UBI pool that receives fees
interface IUBIPool {
    function fundUBIPool(uint256 amount) external;
}

contract UBIFeeHook {
    // ============ State ============

    /// @notice The pool manager this hook is registered with
    address public immutable poolManager;

    /// @notice The UBI pool that receives fee share
    address public ubiPool;

    /// @notice Fee percentage routed to UBI in basis points (3333 = 33.33%)
    uint256 public ubiFeeShareBPS;

    /// @notice Admin who can adjust parameters
    address public admin;

    /// @notice Whether the hook is paused
    bool public paused;

    /// @notice Total fees routed to UBI (per token)
    mapping(address => uint256) public totalUBIFees;

    /// @notice Total swaps processed
    uint256 public totalSwapsProcessed;

    // ============ Constants ============

    uint256 public constant MAX_FEE_BPS = 5000; // Max 50%
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ============ Events ============

    event UBIFeeCollected(
        address indexed token,
        uint256 feeAmount,
        uint256 ubiShare,
        address indexed pool
    );
    event UBIFeeShareUpdated(uint256 oldBPS, uint256 newBPS);
    event UBIPoolUpdated(address oldPool, address newPool);
    event AdminUpdated(address oldAdmin, address newAdmin);
    event HookPaused(bool isPaused);

    // ============ Errors ============

    error NotPoolManager();
    error NotAdmin();
    error FeeTooHigh();
    error ZeroAddress();
    error HookIsPaused();
    error TransferFailed();

    // ============ Modifiers ============

    modifier onlyPoolManager() {
        if (msg.sender != poolManager) revert NotPoolManager();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ============ Constructor ============

    /**
     * @param _poolManager Address of the Uniswap V4 PoolManager
     * @param _ubiPool Address of the UBI pool to receive fees
     * @param _ubiFeeShareBPS Fee share in basis points (e.g., 3333 for 33.33%)
     * @param _admin Admin address
     */
    constructor(
        address _poolManager,
        address _ubiPool,
        uint256 _ubiFeeShareBPS,
        address _admin
    ) {
        if (_poolManager == address(0)) revert ZeroAddress();
        if (_ubiPool == address(0)) revert ZeroAddress();
        if (_admin == address(0)) revert ZeroAddress();
        if (_ubiFeeShareBPS > MAX_FEE_BPS) revert FeeTooHigh();

        poolManager = _poolManager;
        ubiPool = _ubiPool;
        ubiFeeShareBPS = _ubiFeeShareBPS;
        admin = _admin;
    }

    // ============ Hook Callback ============

    /**
     * @notice Called by PoolManager after a swap completes.
     * @dev Calculates the UBI share of the output token and routes it to the UBI pool.
     *      In a real V4 integration, this modifies the delta. Here we simulate by
     *      expecting the fee tokens to be sent to this contract before calling.
     */
    function afterSwap(
        address, /* sender */
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta calldata delta,
        bytes calldata /* hookData */
    ) external onlyPoolManager returns (bytes4) {
        if (paused) return this.afterSwap.selector;

        // Determine which token is the output (positive delta = tokens out)
        address feeToken;
        uint256 outputAmount;

        if (params.zeroForOne) {
            // Swapping token0 → token1, output is token1
            feeToken = key.currency1;
            outputAmount = delta.amount1 > 0 ? uint256(uint128(delta.amount1)) : 0;
        } else {
            // Swapping token1 → token0, output is token0
            feeToken = key.currency0;
            outputAmount = delta.amount0 > 0 ? uint256(uint128(delta.amount0)) : 0;
        }

        if (outputAmount == 0) return this.afterSwap.selector;

        // Calculate UBI fee share
        uint256 ubiShare = calculateUBIFee(outputAmount);
        if (ubiShare == 0) return this.afterSwap.selector;

        // Fund the UBI pool via fundUBIPool() so the ubiPool counter
        // inside GoodDollarToken is incremented. The hook holds the fee
        // tokens; fundUBIPool calls _transfer(msg.sender, address(this))
        // which moves them from this hook into the token contract.
        IUBIPool(ubiPool).fundUBIPool(ubiShare);

        totalUBIFees[feeToken] += ubiShare;
        totalSwapsProcessed++;

        emit UBIFeeCollected(feeToken, outputAmount, ubiShare, ubiPool);

        return this.afterSwap.selector;
    }

    // ============ Fee Calculation ============

    /**
     * @notice Calculate the UBI fee for a given amount
     * @param amount The total amount to calculate fee from
     * @return ubiShare The amount that goes to UBI
     */
    function calculateUBIFee(uint256 amount) public view returns (uint256) {
        return (amount * ubiFeeShareBPS) / BPS_DENOMINATOR;
    }

    // ============ Hook Permissions ============

    /**
     * @notice Returns which hooks are enabled
     * @dev Only afterSwap is enabled
     */
    function getHookPermissions() external pure returns (Hooks memory) {
        return Hooks({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false
        });
    }

    // ============ Admin Functions ============

    /**
     * @notice Update the UBI fee share percentage
     * @param newBPS New fee share in basis points
     */
    function setUBIFeeShare(uint256 newBPS) external onlyAdmin {
        if (newBPS > MAX_FEE_BPS) revert FeeTooHigh();
        uint256 oldBPS = ubiFeeShareBPS;
        ubiFeeShareBPS = newBPS;
        emit UBIFeeShareUpdated(oldBPS, newBPS);
    }

    /**
     * @notice Update the UBI pool address
     * @param newPool New UBI pool address
     */
    function setUBIPool(address newPool) external onlyAdmin {
        if (newPool == address(0)) revert ZeroAddress();
        address oldPool = ubiPool;
        ubiPool = newPool;
        emit UBIPoolUpdated(oldPool, newPool);
    }

    /**
     * @notice Transfer admin role
     * @param newAdmin New admin address
     */
    function setAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminUpdated(oldAdmin, newAdmin);
    }

    /**
     * @notice Pause/unpause the hook
     * @param _paused Whether to pause
     */
    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit HookPaused(_paused);
    }

    // ============ View Functions ============

    /**
     * @notice Get total UBI fees collected for a token
     */
    function getUBIFeesForToken(address token) external view returns (uint256) {
        return totalUBIFees[token];
    }

    /**
     * @notice Rescue tokens accidentally sent to this contract
     */
    function rescueTokens(address token, address to, uint256 amount) external onlyAdmin {
        if (to == address(0)) revert ZeroAddress();
        if (!IERC20Minimal(token).transfer(to, amount)) revert TransferFailed();
    }
}
