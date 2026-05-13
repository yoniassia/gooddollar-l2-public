// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/interfaces/IERC20.sol";

/**
 * @notice Minimal read interface for GoodPool (x*y=k AMM).
 */
interface IGoodPool {
    function tokenA() external view returns (address);
    function tokenB() external view returns (address);
    function reserveA() external view returns (uint256);
    function reserveB() external view returns (uint256);
    function swap(address tokenIn, uint256 amountIn, uint256 minOut) external returns (uint256 amountOut);
    function getAmountOut(address tokenIn, uint256 amountIn) external view returns (uint256);
}

/**
 * @title GoodSwapRouter
 * @notice UniV2-style router for the GoodSwap constant-product AMM.
 *
 *         Users approve the router (not individual pools) and call
 *         swapExactTokensForTokens / swapTokensForExactTokens. The router
 *         looks up the registered GoodPool for the given token pair, executes
 *         the swap, and forwards output tokens to `to`.
 *
 *         Fee architecture: GoodPool collects 0.3% on input and routes 33.33%
 *         of that fee to the UBIFeeSplitter automatically (no router action
 *         needed). The router only handles routing and slippage enforcement.
 *
 * @dev Only direct (single-hop) swaps are supported. Multi-hop paths with
 *      more than 2 tokens are not implemented.
 */
contract GoodSwapRouter {
    // ─── State ────────────────────────────────────────────────────────────────

    address public owner;

    /// @notice Pool registry: canonical pair key → GoodPool address.
    ///         Key is keccak256(abi.encodePacked(lowerAddr, higherAddr)).
    mapping(bytes32 => address) public pools;

    // ─── Events ───────────────────────────────────────────────────────────────

    event PoolRegistered(address indexed tokenA, address indexed tokenB, address indexed pool);
    event PoolRemoved(address indexed tokenA, address indexed tokenB);
    event Swap(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address indexed to
    );

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error ZeroAddress();
    error PoolNotFound(address tokenIn, address tokenOut);
    error InsufficientOutputAmount();
    error ExcessiveInputAmount();
    error Expired();
    error InvalidPath();
    error TransferFailed();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier ensure(uint256 deadline) {
        if (deadline < block.timestamp) revert Expired();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /**
     * @notice Register a GoodPool for a token pair.
     * @dev Callable only by owner. The pool's tokenA/tokenB are read from the
     *      contract to ensure the canonical key matches the pool's own ordering.
     */
    function registerPool(address pool) external onlyOwner {
        if (pool == address(0)) revert ZeroAddress();
        address tA = IGoodPool(pool).tokenA();
        address tB = IGoodPool(pool).tokenB();
        bytes32 key = _pairKey(tA, tB);
        pools[key] = pool;
        emit PoolRegistered(tA, tB, pool);
    }

    /**
     * @notice Remove a pool from the registry.
     */
    function removePool(address tokenA, address tokenB) external onlyOwner {
        bytes32 key = _pairKey(tokenA, tokenB);
        delete pools[key];
        emit PoolRemoved(tokenA, tokenB);
    }

    /**
     * @notice Transfer ownership.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    /**
     * @notice Look up the pool for a given token pair (order-independent).
     */
    function getPool(address tokenIn, address tokenOut) public view returns (address) {
        return pools[_pairKey(tokenIn, tokenOut)];
    }

    /**
     * @notice Quote: how much tokenOut for `amountIn` of tokenIn?
     */
    function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut)
        public
        view
        returns (uint256 amountOut)
    {
        address pool = getPool(tokenIn, tokenOut);
        if (pool == address(0)) revert PoolNotFound(tokenIn, tokenOut);
        return IGoodPool(pool).getAmountOut(tokenIn, amountIn);
    }

    /**
     * @notice Quote: how much tokenIn is needed to receive exactly `amountOut`?
     *
     *         Inverse of the GoodPool AMM formula (0.3% fee):
     *           amountIn = ceil(amountOut * resIn * 10000 / ((resOut - amountOut) * 9970))
     */
    function getAmountIn(uint256 amountOut, address tokenIn, address tokenOut)
        public
        view
        returns (uint256 amountIn)
    {
        address pool = getPool(tokenIn, tokenOut);
        if (pool == address(0)) revert PoolNotFound(tokenIn, tokenOut);

        (uint256 resIn, uint256 resOut) = _sortedReserves(IGoodPool(pool), tokenIn);
        require(amountOut < resOut, "GoodSwapRouter: insufficient reserves");

        // ceil division: (numerator + denominator - 1) / denominator
        uint256 numerator   = amountOut * resIn * 10_000;
        uint256 denominator = (resOut - amountOut) * 9_970;
        amountIn = (numerator + denominator - 1) / denominator;
    }

    // ─── Swap ─────────────────────────────────────────────────────────────────

    /**
     * @notice Swap an exact input amount for as many output tokens as possible.
     * @param amountIn     Exact amount of tokenIn to spend.
     * @param amountOutMin Minimum amount of tokenOut to receive (slippage guard).
     * @param path         Two-element array: [tokenIn, tokenOut].
     * @param to           Recipient of output tokens.
     * @param deadline     Unix timestamp after which the transaction reverts.
     * @return amountOut   Actual amount of tokenOut received.
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountOut) {
        if (path.length != 2) revert InvalidPath();
        address tokenIn  = path[0];
        address tokenOut = path[1];
        if (to == address(0)) revert ZeroAddress();

        address pool = getPool(tokenIn, tokenOut);
        if (pool == address(0)) revert PoolNotFound(tokenIn, tokenOut);

        // Pull tokenIn from caller into router.
        if (!IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn)) revert TransferFailed();

        // Approve pool to pull from router.
        if (!IERC20(tokenIn).approve(pool, amountIn)) revert TransferFailed();

        // Execute swap — output goes to router first.
        amountOut = IGoodPool(pool).swap(tokenIn, amountIn, amountOutMin);

        if (amountOut < amountOutMin) revert InsufficientOutputAmount();

        // Forward output to recipient.
        if (!IERC20(tokenOut).transfer(to, amountOut)) revert TransferFailed();

        emit Swap(tokenIn, tokenOut, amountIn, amountOut, to);
    }

    /**
     * @notice Receive an exact output amount by spending as few input tokens as possible.
     * @param amountOut    Exact amount of tokenOut to receive.
     * @param amountInMax  Maximum amount of tokenIn to spend (slippage guard).
     * @param path         Two-element array: [tokenIn, tokenOut].
     * @param to           Recipient of output tokens.
     * @param deadline     Unix timestamp after which the transaction reverts.
     * @return amountIn    Actual amount of tokenIn spent.
     */
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountIn) {
        if (path.length != 2) revert InvalidPath();
        address tokenIn  = path[0];
        address tokenOut = path[1];
        if (to == address(0)) revert ZeroAddress();

        amountIn = getAmountIn(amountOut, tokenIn, tokenOut);
        if (amountIn > amountInMax) revert ExcessiveInputAmount();

        address pool = getPool(tokenIn, tokenOut);

        // Pull the computed amountIn from caller into router.
        if (!IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn)) revert TransferFailed();

        // Approve pool to pull from router.
        if (!IERC20(tokenIn).approve(pool, amountIn)) revert TransferFailed();

        // Execute swap with exact output enforced by slippage guard.
        uint256 received = IGoodPool(pool).swap(tokenIn, amountIn, amountOut);
        if (received < amountOut) revert InsufficientOutputAmount();

        // Forward output to recipient.
        if (!IERC20(tokenOut).transfer(to, received)) revert TransferFailed();

        emit Swap(tokenIn, tokenOut, amountIn, received, to);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    /**
     * @dev Canonical key for a token pair: keccak256(lower, higher).
     */
    function _pairKey(address a, address b) internal pure returns (bytes32) {
        (address lo, address hi) = a < b ? (a, b) : (b, a);
        return keccak256(abi.encodePacked(lo, hi));
    }

    /**
     * @dev Return (reserveIn, reserveOut) sorted relative to tokenIn.
     *      GoodPool always stores the lower-address token as reserveA.
     */
    function _sortedReserves(IGoodPool pool, address tokenIn)
        internal
        view
        returns (uint256 resIn, uint256 resOut)
    {
        uint256 rA = pool.reserveA();
        uint256 rB = pool.reserveB();
        address tA = pool.tokenA();
        // If tokenIn == tokenA: resIn = rA, resOut = rB; else swap.
        (resIn, resOut) = (tokenIn == tA) ? (rA, rB) : (rB, rA);
    }
}
