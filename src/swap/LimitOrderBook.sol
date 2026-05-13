// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/interfaces/IERC20.sol";

/**
 * @title LimitOrderBook
 * @notice On-chain limit order book for GoodSwap. Agents place buy/sell orders
 *         at a target price. Keepers fill orders when AMM price reaches target.
 *
 * Architecture:
 *   - Orders are stored on-chain with escrowed tokenIn
 *   - Keepers call fillOrder() when AMM price ≥ target (sells) or ≤ target (buys)
 *   - Fill executes via GoodSwapRouter, output goes to order owner
 *   - UBI fee is embedded in the AMM swap (no extra fee here)
 *   - Orders can have expiry timestamps
 *   - Partial fills are supported
 *
 * Fee: 0.05% keeper incentive on fill (paid from output tokens)
 *
 * Security: follows Checks-Effects-Interactions and guards fillOrder with a
 * reentrancy lock to prevent a malicious router from re-entering and replaying fills.
 */
contract LimitOrderBook {
    // ─── Types ────────────────────────────────────────────────────────────────

    enum OrderStatus { Active, Filled, Cancelled, Expired }

    struct Order {
        address owner;          // Who placed the order
        address tokenIn;        // Token being sold
        address tokenOut;       // Token being bought
        uint256 amountIn;       // Total input amount escrowed
        uint256 amountFilled;   // How much input has been filled
        uint256 targetPrice;    // Price threshold (scaled 1e18): tokenOut per tokenIn
        uint256 expiry;         // Unix timestamp, 0 = no expiry
        OrderStatus status;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    address public owner;
    address public router;      // GoodSwapRouter address

    uint256 public nextOrderId;
    mapping(uint256 => Order) public orders;

    /// @notice Per-user active order tracking
    mapping(address => uint256[]) public userOrders;

    /// @notice Keeper incentive in basis points (default 5 = 0.05%)
    uint256 public keeperFeeBps = 5;

    /// @notice Maximum orders per user (prevent gas griefing)
    uint256 public constant MAX_ORDERS_PER_USER = 100;

    // ─── Events ───────────────────────────────────────────────────────────────

    event OrderPlaced(
        uint256 indexed orderId,
        address indexed owner,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 targetPrice,
        uint256 expiry
    );

    event OrderFilled(
        uint256 indexed orderId,
        address indexed keeper,
        uint256 amountIn,
        uint256 amountOut,
        uint256 keeperReward
    );

    event OrderCancelled(uint256 indexed orderId);
    event OrderExpired(uint256 indexed orderId);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotOwner();
    error NotOrderOwner();
    error ZeroAmount();
    error ZeroAddress();
    error ZeroPriceNotAllowed();
    error OrderNotActive();
    error PriceNotMet();
    error OrderExpiredErr();
    error TooManyOrders();
    error InvalidFee();
    error TransferFailed();
    error Reentrancy();
    error LengthMismatch();

    /// @dev Reentrancy lock. 1 = unlocked, 2 = locked.
    uint256 private _lock = 1;

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _router, address _owner) {
        if (_router == address(0) || _owner == address(0)) revert ZeroAddress();
        router = _router;
        owner = _owner;
    }

    // ─── User Actions ─────────────────────────────────────────────────────────

    /**
     * @notice Place a limit order. TokenIn is escrowed immediately.
     * @param tokenIn     Token to sell
     * @param tokenOut    Token to buy
     * @param amountIn    Amount of tokenIn to sell
     * @param targetPrice Minimum output per unit input (1e18 scaled).
     *                    E.g., 2000e18 means "I want at least 2000 tokenOut per tokenIn"
     * @param expiry      Unix timestamp when order expires (0 = never)
     * @return orderId    ID of the created order
     */
    function placeOrder(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 targetPrice,
        uint256 expiry
    ) external returns (uint256 orderId) {
        if (amountIn == 0) revert ZeroAmount();
        if (tokenIn == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (targetPrice == 0) revert ZeroPriceNotAllowed();
        if (expiry != 0 && expiry <= block.timestamp) revert OrderExpiredErr();
        if (userOrders[msg.sender].length >= MAX_ORDERS_PER_USER) revert TooManyOrders();

        // Escrow tokenIn
        if (!IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn)) revert TransferFailed();

        orderId = nextOrderId++;
        orders[orderId] = Order({
            owner: msg.sender,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            amountFilled: 0,
            targetPrice: targetPrice,
            expiry: expiry,
            status: OrderStatus.Active
        });

        userOrders[msg.sender].push(orderId);

        emit OrderPlaced(orderId, msg.sender, tokenIn, tokenOut, amountIn, targetPrice, expiry);
    }

    /**
     * @notice Cancel an active order. Refunds escrowed tokens.
     */
    function cancelOrder(uint256 orderId) external {
        Order storage order = orders[orderId];
        if (order.owner != msg.sender) revert NotOrderOwner();
        if (order.status != OrderStatus.Active) revert OrderNotActive();

        order.status = OrderStatus.Cancelled;

        // Refund remaining escrowed amount
        uint256 remaining = order.amountIn - order.amountFilled;
        if (remaining > 0) {
            if (!IERC20(order.tokenIn).transfer(msg.sender, remaining)) revert TransferFailed();
        }

        emit OrderCancelled(orderId);
    }

    // ─── Keeper Actions ───────────────────────────────────────────────────────

    /**
     * @notice Fill a limit order via GoodSwapRouter. Anyone can call (keeper).
     * @param orderId     Order to fill
     * @param fillAmount  Amount of tokenIn to fill (for partial fills)
     *
     * @dev The keeper earns 0.05% of the output tokens as incentive.
     *      Price check: actual output / fillAmount must meet targetPrice.
     *      nonReentrant guard + CEI ordering: state is updated before any external call
     *      to prevent a malicious router from re-entering and replaying the fill.
     */
    function fillOrder(uint256 orderId, uint256 fillAmount) external nonReentrant {
        Order storage order = orders[orderId];
        if (order.status != OrderStatus.Active) revert OrderNotActive();

        // Check expiry — mark expired, refund, and return (no revert, so state persists)
        if (order.expiry != 0 && block.timestamp > order.expiry) {
            order.status = OrderStatus.Expired;
            uint256 refund = order.amountIn - order.amountFilled;
            if (refund > 0) {
                if (!IERC20(order.tokenIn).transfer(order.owner, refund)) revert TransferFailed();
            }
            emit OrderExpired(orderId);
            return; // Don't revert — state changes must persist
        }

        uint256 remaining = order.amountIn - order.amountFilled;
        if (fillAmount > remaining) fillAmount = remaining;
        if (fillAmount == 0) revert ZeroAmount();

        // ── Effects (before any external call) ──────────────────────────────
        order.amountFilled += fillAmount;
        if (order.amountFilled >= order.amountIn) {
            order.status = OrderStatus.Filled;
        }

        // ── Interactions ─────────────────────────────────────────────────────

        // Approve router for exactly this fill
        if (!IERC20(order.tokenIn).approve(router, fillAmount)) revert TransferFailed();

        address[] memory path = new address[](2);
        path[0] = order.tokenIn;
        path[1] = order.tokenOut;

        // Calculate minimum output from target price
        uint256 minOutput = (fillAmount * order.targetPrice) / 1e18;

        // Call router — deadline = current block (immediate fill)
        (bool success, bytes memory data) = router.call(
            abi.encodeWithSignature(
                "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
                fillAmount,
                minOutput,
                path,
                address(this),  // Output to this contract first (for keeper fee split)
                block.timestamp
            )
        );

        if (!success) revert PriceNotMet();

        uint256 amountOut = abi.decode(data, (uint256));

        // Price check: amountOut / fillAmount >= targetPrice (in 1e18)
        uint256 effectivePrice = (amountOut * 1e18) / fillAmount;
        if (effectivePrice < order.targetPrice) revert PriceNotMet();

        // Split: keeper gets incentive, rest to order owner
        uint256 keeperReward = (amountOut * keeperFeeBps) / 10_000;
        uint256 ownerAmount = amountOut - keeperReward;

        if (!IERC20(order.tokenOut).transfer(order.owner, ownerAmount)) revert TransferFailed();
        if (keeperReward > 0) {
            if (!IERC20(order.tokenOut).transfer(msg.sender, keeperReward)) revert TransferFailed();
        }

        emit OrderFilled(orderId, msg.sender, fillAmount, ownerAmount, keeperReward);
    }

    /**
     * @notice Batch fill multiple orders in one tx (gas efficient for keepers).
     * @param orderIds    Array of order IDs to fill
     * @param fillAmounts Array of fill amounts (same length as orderIds)
     */
    function batchFill(uint256[] calldata orderIds, uint256[] calldata fillAmounts) external {
        if (orderIds.length != fillAmounts.length) revert LengthMismatch();
        for (uint256 i = 0; i < orderIds.length; i++) {
            // Use try/catch so one failed fill doesn't revert the batch
            try this.fillOrder(orderIds[i], fillAmounts[i]) {} catch {}
        }
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /**
     * @notice Get all order IDs for a user.
     */
    function getUserOrders(address user) external view returns (uint256[] memory) {
        return userOrders[user];
    }

    /**
     * @notice Get active orders for a user.
     */
    function getActiveOrders(address user) external view returns (uint256[] memory activeIds) {
        uint256[] memory allIds = userOrders[user];
        uint256 count;
        for (uint256 i = 0; i < allIds.length; i++) {
            if (orders[allIds[i]].status == OrderStatus.Active) count++;
        }
        activeIds = new uint256[](count);
        uint256 j;
        for (uint256 i = 0; i < allIds.length; i++) {
            if (orders[allIds[i]].status == OrderStatus.Active) {
                activeIds[j++] = allIds[i];
            }
        }
    }

    /**
     * @notice Check if an order is fillable at current AMM price.
     */
    function isFillable(uint256 orderId) external view returns (bool) {
        Order storage order = orders[orderId];
        if (order.status != OrderStatus.Active) return false;
        if (order.expiry != 0 && block.timestamp > order.expiry) return false;

        uint256 remaining = order.amountIn - order.amountFilled;
        if (remaining == 0) return false;

        // Check AMM price
        try IGoodSwapRouter(router).getAmountOut(remaining, order.tokenIn, order.tokenOut)
            returns (uint256 amountOut)
        {
            uint256 effectivePrice = (amountOut * 1e18) / remaining;
            return effectivePrice >= order.targetPrice;
        } catch {
            return false;
        }
    }

    /**
     * @notice Get full order details (packed struct fields).
     */
    function getOrder(uint256 orderId) external view returns (
        address orderOwner,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountFilled,
        uint256 targetPrice,
        uint256 expiry,
        OrderStatus status
    ) {
        Order storage o = orders[orderId];
        return (o.owner, o.tokenIn, o.tokenOut, o.amountIn, o.amountFilled, o.targetPrice, o.expiry, o.status);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setKeeperFeeBps(uint256 _bps) external onlyOwner {
        if (_bps > 100) revert InvalidFee(); // Max 1%
        keeperFeeBps = _bps;
    }

    function setRouter(address _router) external onlyOwner {
        if (_router == address(0)) revert ZeroAddress();
        router = _router;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }
}

// ─── Router interface for view calls ──────────────────────────────────────────

interface IGoodSwapRouter {
    function getAmountOut(uint256 amountIn, address tokenIn, address tokenOut) external view returns (uint256);
    function swapExactTokensForTokens(
        uint256 amountIn, uint256 amountOutMin, address[] calldata path,
        address to, uint256 deadline
    ) external returns (uint256 amountOut);
}
