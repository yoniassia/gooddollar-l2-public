// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GoodSwap
 * @notice Constant-product AMM pair for GoodDollar L2.
 *         Modelled on the Uniswap V2 pair interface so existing tooling
 *         (subgraphs, SDKs, analytics) works without modification.
 *
 * @dev Key deviation from reference implementations:
 *      The `Swap` event's last argument is `to` (the actual recipient),
 *      NOT `msg.sender`.  When a router calls `swap(..., to)` on behalf of
 *      a user, `msg.sender` is the router address — off-chain indexers must
 *      receive the true beneficiary address, not the intermediary.
 */
interface IERC20Minimal {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IGoodSwapCallee {
    function goodSwapCall(address sender, uint amount0, uint amount1, bytes calldata data) external;
}

contract GoodSwap {
    // ─── Events ────────────────────────────────────────────────────────────────

    event Mint(address indexed sender, uint amount0, uint amount1);
    event Burn(address indexed sender, uint amount0, uint amount1, address indexed to);
    /**
     * @dev `to` is the actual swap recipient — NOT msg.sender (which may be a router).
     *      GOO-99: using `to` here instead of `msg.sender` fixes the recipient mismatch
     *      that caused off-chain indexers to record router addresses as swap recipients.
     */
    event Swap(
        address indexed sender,
        uint amount0In,
        uint amount1In,
        uint amount0Out,
        uint amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    // ─── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    // ─── State ─────────────────────────────────────────────────────────────────

    address public factory;
    address public token0;
    address public token1;

    uint112 private _reserve0;
    uint112 private _reserve1;
    uint32  private _blockTimestampLast;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    uint256 public kLast;

    // Minimal LP token accounting (no full ERC-20 to keep scope tight)
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    uint256 private _unlocked = 1;

    // ─── Errors ────────────────────────────────────────────────────────────────

    error Locked();
    error InsufficientOutputAmount();
    error InsufficientLiquidity();
    error InvalidRecipient();
    error InsufficientInputAmount();
    error InvariantViolated();
    error InsufficientLiquidityMinted();
    error InsufficientLiquidityBurned();
    error Overflow();
    error TransferFailed();

    // ─── Modifiers ─────────────────────────────────────────────────────────────

    modifier lock() {
        if (_unlocked != 1) revert Locked();
        _unlocked = 2;
        _;
        _unlocked = 1;
    }

    // ─── Constructor ───────────────────────────────────────────────────────────

    /**
     * @notice Initialize a GoodSwap pair for two tokens.
     * @param _token0 The first token in the pair
     * @param _token1 The second token in the pair
     * @dev Factory is set to msg.sender (the deploying contract)
     */
    constructor(address _token0, address _token1) {
        factory = msg.sender;
        token0  = _token0;
        token1  = _token1;
    }

    // ─── View ──────────────────────────────────────────────────────────────────

    /**
     * @notice Get the current token reserves and last update timestamp.
     * @return reserve0 Current reserve amount of token0
     * @return reserve1 Current reserve amount of token1
     * @return blockTimestampLast Timestamp of the last reserve update
     */
    function getReserves()
        public
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)
    {
        reserve0           = _reserve0;
        reserve1           = _reserve1;
        blockTimestampLast = _blockTimestampLast;
    }

    // ─── Core ──────────────────────────────────────────────────────────────────

    /**
     * @notice Add liquidity and receive LP tokens.
     * @param to Address that receives the LP tokens.
     * @return liquidity Amount of LP tokens minted
     */
    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 r0, uint112 r1,) = getReserves();
        uint256 bal0 = IERC20Minimal(token0).balanceOf(address(this));
        uint256 bal1 = IERC20Minimal(token1).balanceOf(address(this));
        uint256 amt0 = bal0 - r0;
        uint256 amt1 = bal1 - r1;

        uint256 _totalSupply = totalSupply;
        if (_totalSupply == 0) {
            liquidity = _sqrt(amt0 * amt1) - MINIMUM_LIQUIDITY;
            balanceOf[address(0)] += MINIMUM_LIQUIDITY; // permanently locked
            totalSupply           += MINIMUM_LIQUIDITY;
        } else {
            uint256 l0 = (amt0 * _totalSupply) / r0;
            uint256 l1 = (amt1 * _totalSupply) / r1;
            liquidity  = l0 < l1 ? l0 : l1;
        }
        if (liquidity == 0) revert InsufficientLiquidityMinted();

        balanceOf[to] += liquidity;
        totalSupply   += liquidity;

        _update(bal0, bal1, r0, r1);
        emit Mint(msg.sender, amt0, amt1);
    }

    /**
     * @notice Remove liquidity and return underlying tokens.
     * @param to Address that receives the tokens.
     * @return amount0 Amount of token0 returned
     * @return amount1 Amount of token1 returned
     */
    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        uint256 liquidity    = balanceOf[address(this)]; // LP tokens sent here first
        uint256 _totalSupply = totalSupply;
        uint256 bal0 = IERC20Minimal(token0).balanceOf(address(this));
        uint256 bal1 = IERC20Minimal(token1).balanceOf(address(this));

        amount0 = (liquidity * bal0) / _totalSupply;
        amount1 = (liquidity * bal1) / _totalSupply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();

        balanceOf[address(this)] -= liquidity;
        totalSupply              -= liquidity;

        _safeTransfer(token0, to, amount0);
        _safeTransfer(token1, to, amount1);

        bal0 = IERC20Minimal(token0).balanceOf(address(this));
        bal1 = IERC20Minimal(token1).balanceOf(address(this));

        _update(bal0, bal1, _reserve0, _reserve1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    /**
     * @notice Execute a swap.
     * @param amount0Out  Amount of token0 to send out.
     * @param amount1Out  Amount of token1 to send out.
     * @param to          Recipient of the output tokens.
     * @param data        Non-empty triggers a flash-swap callback to `to`.
     */
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external lock {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        (uint112 r0, uint112 r1,) = getReserves();
        if (amount0Out >= r0 || amount1Out >= r1) revert InsufficientLiquidity();
        if (to == token0 || to == token1) revert InvalidRecipient();

        if (amount0Out > 0) _safeTransfer(token0, to, amount0Out);
        if (amount1Out > 0) _safeTransfer(token1, to, amount1Out);
        if (data.length > 0) IGoodSwapCallee(to).goodSwapCall(msg.sender, amount0Out, amount1Out, data);

        uint256 bal0 = IERC20Minimal(token0).balanceOf(address(this));
        uint256 bal1 = IERC20Minimal(token1).balanceOf(address(this));

        uint256 amt0In = bal0 > r0 - amount0Out ? bal0 - (r0 - amount0Out) : 0;
        uint256 amt1In = bal1 > r1 - amount1Out ? bal1 - (r1 - amount1Out) : 0;
        if (amt0In == 0 && amt1In == 0) revert InsufficientInputAmount();

        _verifyAndUpdateSwap(bal0, bal1, r0, r1, amt0In, amt1In, amount0Out, amount1Out, to);
    }

    /**
     * @notice Force balances to match reserves (rescue mistakenly sent tokens).
     * @param to Address that receives the excess tokens
     */
    function skim(address to) external lock {
        _safeTransfer(token0, to, IERC20Minimal(token0).balanceOf(address(this)) - _reserve0);
        _safeTransfer(token1, to, IERC20Minimal(token1).balanceOf(address(this)) - _reserve1);
    }

    /**
     * @notice Force reserves to match balances.
     */
    function sync() external lock {
        _update(
            IERC20Minimal(token0).balanceOf(address(this)),
            IERC20Minimal(token1).balanceOf(address(this)),
            _reserve0,
            _reserve1
        );
    }

    // ─── Internal ──────────────────────────────────────────────────────────────

    /**
     * @dev Enforce the constant-product invariant, update reserves, and emit Swap.
     *
     *      GOO-99 fix: `to` is passed in and used as the last argument of the
     *      Swap event instead of `msg.sender`.  When a router routes on behalf
     *      of a user, `to` is the user; `msg.sender` is the router.  Off-chain
     *      indexers and subgraphs rely on this field for recipient attribution.
     */
    function _verifyAndUpdateSwap(
        uint256 bal0,
        uint256 bal1,
        uint112 r0,
        uint112 r1,
        uint256 amt0In,
        uint256 amt1In,
        uint256 amt0Out,
        uint256 amt1Out,
        address to
    ) internal {
        // 0.3% fee: adjusted_balance * 1000 >= reserve * 1000 (Uniswap V2 invariant)
        uint256 bal0Adj = bal0 * 1000 - amt0In * 3;
        uint256 bal1Adj = bal1 * 1000 - amt1In * 3;
        if (bal0Adj * bal1Adj < uint256(r0) * uint256(r1) * 1_000_000) revert InvariantViolated();

        _update(bal0, bal1, r0, r1);

        // Emit Swap with `to` as the recipient — NOT msg.sender (GOO-99)
        emit Swap(msg.sender, amt0In, amt1In, amt0Out, amt1Out, to);
    }

    function _update(uint256 bal0, uint256 bal1, uint112 r0, uint112 r1) internal {
        if (bal0 > type(uint112).max || bal1 > type(uint112).max) revert Overflow();

        uint32 ts = uint32(block.timestamp);
        uint32 elapsed = ts - _blockTimestampLast;
        if (elapsed > 0 && r0 != 0 && r1 != 0) {
            // TWAP accumulators (overflow intentional — uint256 wraps)
            unchecked {
                price0CumulativeLast += (uint256(r1) << 112) / r0 * elapsed;
                price1CumulativeLast += (uint256(r0) << 112) / r1 * elapsed;
            }
        }

        _reserve0            = uint112(bal0);
        _reserve1            = uint112(bal1);
        _blockTimestampLast  = ts;

        emit Sync(_reserve0, _reserve1);
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        if (!IERC20Minimal(token).transfer(to, amount)) revert TransferFailed();
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) { z = x; x = (y / x + x) / 2; }
        } else if (y != 0) {
            z = 1;
        }
    }
}
