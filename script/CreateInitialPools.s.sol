// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/interfaces/IERC20.sol";

/**
 * @title CreateInitialPools
 * @notice Deploys and seeds three constant-product (x*y=k) liquidity pools
 *         on GoodDollar L2 devnet:
 *
 *         Pool 1 — G$ / WETH   (1 ETH ≈ 3,000 G$)
 *         Pool 2 — G$ / USDC   (1 G$ ≈ 1.00 USDC)
 *         Pool 3 — WETH / USDC (1 ETH ≈ 3,000 USDC)
 *
 * The pools are minimal x*y=k AMMs that:
 *   - Accept ERC-20 deposits via addLiquidity()
 *   - Support getAmountOut() price queries
 *   - Support swap() execution
 *   - Collect a 0.3% fee (30 BPS) on every swap
 *
 * The UBIFeeHook integration (upgrading to Uniswap V4) happens in a separate
 * migration once the real PoolManager is deployed to devnet.
 *
 * Usage (devnet):
 *   PRIVATE_KEY=<key> \
 *   GOOD_DOLLAR_TOKEN=<addr> \
 *   WETH_ADDRESS=<addr> \
 *   USDC_ADDRESS=<addr> \
 *   forge script script/CreateInitialPools.s.sol \
 *     --rpc-url $DEVNET_RPC --broadcast --legacy
 *
 * If WETH_ADDRESS / USDC_ADDRESS are not set, fresh MockERC20 tokens are
 * deployed so the script can run in a standalone environment.
 */

// ─── Minimal ERC-20 mock (for devnet only) ────────────────────────────────────

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

// ─── Constant-product AMM pool ────────────────────────────────────────────────

/**
 * @title GoodPool
 * @notice Minimal x*y=k AMM for GoodDollar L2 devnet.
 *
 * Invariant: reserveA * reserveB = k (after fees)
 * Swap fee: 30 BPS (0.3%) — collected as tokenIn, stays in the pool
 *           (33.33% of fees are forwarded to UBIFeeSplitter once set)
 */
contract GoodPool {
    address public immutable tokenA;
    address public immutable tokenB;
    address public feeBeneficiary;   // UBIFeeSplitter address (set post-deploy)
    address public owner;

    uint256 public reserveA;
    uint256 public reserveB;
    uint256 public totalLiquidity;

    mapping(address => uint256) public liquidity;

    uint256 constant FEE_BPS = 30;        // 0.3%
    uint256 constant UBI_FEE_BPS = 3333;  // 33.33% of swap fees → UBI
    uint256 constant BPS_DENOM = 10_000;

    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 lp);
    event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 lp);
    event Swap(address indexed trader, address tokenIn, uint256 amountIn, uint256 amountOut, uint256 fee);

    constructor(address _tokenA, address _tokenB, address _owner) {
        require(_tokenA != _tokenB, "GoodPool: identical tokens");
        // Sort tokens by address to ensure canonical ordering
        (tokenA, tokenB) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
        owner = _owner;
    }

    /**
     * @notice Set the UBI fee beneficiary (UBIFeeSplitter address).
     * @dev Called after deployment once the splitter is known.
     */
    function setFeeBeneficiary(address beneficiary) external {
        require(msg.sender == owner, "GoodPool: not owner");
        feeBeneficiary = beneficiary;
    }

    /**
     * @notice Deposit tokenA and tokenB to provide liquidity.
     * @dev First deposit sets the price ratio. Subsequent deposits must
     *      preserve the existing ratio (excess is refunded off-chain).
     */
    function addLiquidity(uint256 amountA, uint256 amountB) external returns (uint256 lp) {
        require(amountA > 0 && amountB > 0, "GoodPool: zero amount");

        IERC20(tokenA).transferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).transferFrom(msg.sender, address(this), amountB);

        if (totalLiquidity == 0) {
            lp = _sqrt(amountA * amountB);
        } else {
            lp = _min(
                (amountA * totalLiquidity) / reserveA,
                (amountB * totalLiquidity) / reserveB
            );
        }
        require(lp > 0, "GoodPool: insufficient liquidity minted");

        reserveA += amountA;
        reserveB += amountB;
        totalLiquidity += lp;
        liquidity[msg.sender] += lp;

        emit LiquidityAdded(msg.sender, amountA, amountB, lp);
    }

    /**
     * @notice Remove liquidity proportionally.
     */
    function removeLiquidity(uint256 lpAmount) external returns (uint256 outA, uint256 outB) {
        require(lpAmount > 0 && lpAmount <= liquidity[msg.sender], "GoodPool: bad lp amount");

        outA = (lpAmount * reserveA) / totalLiquidity;
        outB = (lpAmount * reserveB) / totalLiquidity;

        liquidity[msg.sender] -= lpAmount;
        totalLiquidity -= lpAmount;
        reserveA -= outA;
        reserveB -= outB;

        IERC20(tokenA).transfer(msg.sender, outA);
        IERC20(tokenB).transfer(msg.sender, outB);

        emit LiquidityRemoved(msg.sender, outA, outB, lpAmount);
    }

    /**
     * @notice Execute a swap.
     * @param tokenIn  Must be tokenA or tokenB.
     * @param amountIn Exact amount of tokenIn to swap.
     * @param minOut   Minimum acceptable output (slippage guard).
     */
    function swap(address tokenIn, uint256 amountIn, uint256 minOut) external returns (uint256 amountOut) {
        require(tokenIn == tokenA || tokenIn == tokenB, "GoodPool: invalid token");
        require(amountIn > 0, "GoodPool: zero input");

        bool aToB = tokenIn == tokenA;
        (uint256 resIn, uint256 resOut) = aToB ? (reserveA, reserveB) : (reserveB, reserveA);
        address tokenOut = aToB ? tokenB : tokenA;

        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        uint256 fee = (amountIn * FEE_BPS) / BPS_DENOM;
        uint256 amountInAfterFee = amountIn - fee;

        // x*y=k: amountOut = reserveOut * amountInAfterFee / (reserveIn + amountInAfterFee)
        amountOut = (resOut * amountInAfterFee) / (resIn + amountInAfterFee);
        require(amountOut >= minOut, "GoodPool: slippage exceeded");
        require(amountOut < resOut, "GoodPool: insufficient reserves");

        // Route 33.33% of fee to UBI (if beneficiary set)
        if (feeBeneficiary != address(0)) {
            uint256 ubiFee = (fee * UBI_FEE_BPS) / BPS_DENOM;
            if (ubiFee > 0) {
                IERC20(tokenIn).transfer(feeBeneficiary, ubiFee);
                fee -= ubiFee;
            }
        }

        if (aToB) {
            reserveA += amountInAfterFee + fee;  // fee stays in pool
            reserveB -= amountOut;
        } else {
            reserveB += amountInAfterFee + fee;
            reserveA -= amountOut;
        }

        IERC20(tokenOut).transfer(msg.sender, amountOut);
        emit Swap(msg.sender, tokenIn, amountIn, amountOut, fee);
    }

    /**
     * @notice Get output amount for a given input (read-only price query).
     */
    function getAmountOut(address tokenIn, uint256 amountIn) external view returns (uint256) {
        require(tokenIn == tokenA || tokenIn == tokenB, "GoodPool: invalid token");
        bool aToB = tokenIn == tokenA;
        (uint256 resIn, uint256 resOut) = aToB ? (reserveA, reserveB) : (reserveB, reserveA);

        uint256 amountInAfterFee = amountIn - (amountIn * FEE_BPS) / BPS_DENOM;
        return (resOut * amountInAfterFee) / (resIn + amountInAfterFee);
    }

    /**
     * @notice Return current spot price of tokenA denominated in tokenB.
     *         Returns 18-decimal fixed point. E.g. 3000e18 = 3000 tokenB per tokenA.
     */
    function spotPrice() external view returns (uint256) {
        if (reserveA == 0) return 0;
        return (reserveB * 1e18) / reserveA;
    }

    // ── internal ──────────────────────────────────────────────────────────────

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

// ─── Deployment script ────────────────────────────────────────────────────────

contract CreateInitialPools is Script {
    // ── Seed liquidity amounts ─────────────────────────────────────────────────
    // G$/WETH pool — 3,000,000 G$ + 1,000 WETH (≈ $3,000,000 TVL each side)
    uint256 constant SEED_GD_FOR_WETH_POOL = 3_000_000e18;
    uint256 constant SEED_WETH_FOR_GD_POOL =         1_000e18;

    // G$/USDC pool — 1,000,000 G$ + 1,000,000 USDC (1:1 peg)
    uint256 constant SEED_GD_FOR_USDC_POOL = 1_000_000e18;
    uint256 constant SEED_USDC_FOR_GD_POOL = 1_000_000e6;   // USDC has 6 decimals

    // WETH/USDC pool — 1,000 WETH + 3,000,000 USDC (1 ETH = $3,000)
    uint256 constant SEED_WETH_FOR_USDC_POOL =       1_000e18;
    uint256 constant SEED_USDC_FOR_WETH_POOL = 3_000_000e6;

    function run() external {
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerKey);

        // Read token addresses from env (falls back to fresh MockERC20 deploys)
        address gdAddr   = vm.envOr("GOOD_DOLLAR_TOKEN", address(0));
        address wethAddr = vm.envOr("WETH_ADDRESS",       address(0));
        address usdcAddr = vm.envOr("USDC_ADDRESS",       address(0));
        address ubiSplitterAddr = vm.envOr("UBI_FEE_SPLITTER", address(0));

        vm.startBroadcast(deployerKey);

        // Steps 1-5 are split into helpers to keep this function's stack depth
        // below the EVM limit (needed for forge coverage which disables the optimizer).
        (gdAddr, wethAddr, usdcAddr) =
            _deployMockTokens(deployer, gdAddr, wethAddr, usdcAddr);
        _deployPoolsSeedAndLog(deployer, gdAddr, wethAddr, usdcAddr, ubiSplitterAddr);

        vm.stopBroadcast();
    }

    /**
     * @dev Step 1 — deploy MockERC20 stand-ins for any token addresses not
     *      supplied via environment variables.  Real addresses are passed through
     *      unchanged.
     */
    function _deployMockTokens(
        address deployer,
        address gdAddr,
        address wethAddr,
        address usdcAddr
    ) internal returns (address, address, address) {
        if (gdAddr == address(0)) {
            MockERC20 mock = new MockERC20("GoodDollar", "G$", 18);
            mock.mint(deployer, SEED_GD_FOR_WETH_POOL + SEED_GD_FOR_USDC_POOL);
            gdAddr = address(mock);
            console.log("G$ (devnet mock):", gdAddr);
        }

        if (wethAddr == address(0)) {
            MockERC20 mock = new MockERC20("Wrapped Ether", "WETH", 18);
            mock.mint(deployer, SEED_WETH_FOR_GD_POOL + SEED_WETH_FOR_USDC_POOL);
            wethAddr = address(mock);
            console.log("WETH (devnet mock):", wethAddr);
        }

        if (usdcAddr == address(0)) {
            MockERC20 mock = new MockERC20("USD Coin", "USDC", 6);
            mock.mint(deployer, SEED_USDC_FOR_GD_POOL + SEED_USDC_FOR_WETH_POOL);
            usdcAddr = address(mock);
            console.log("USDC (devnet mock):", usdcAddr);
        }

        return (gdAddr, wethAddr, usdcAddr);
    }

    /**
     * @dev Steps 2-5 — deploy the three GoodPools, wire the UBI fee beneficiary,
     *      seed initial liquidity, and emit a deployment summary.
     */
    function _deployPoolsSeedAndLog(
        address deployer,
        address gdAddr,
        address wethAddr,
        address usdcAddr,
        address ubiSplitterAddr
    ) internal {
        // ── 2. Deploy pools ────────────────────────────────────────────────────

        GoodPool gdWethPool  = new GoodPool(gdAddr, wethAddr, deployer);
        GoodPool gdUsdcPool  = new GoodPool(gdAddr, usdcAddr, deployer);
        GoodPool wethUsdcPool = new GoodPool(wethAddr, usdcAddr, deployer);

        console.log("GoodPool G$/WETH:  ", address(gdWethPool));
        console.log("GoodPool G$/USDC:  ", address(gdUsdcPool));
        console.log("GoodPool WETH/USDC:", address(wethUsdcPool));

        // ── 3. Wire UBI fee beneficiary ────────────────────────────────────────
        if (ubiSplitterAddr != address(0)) {
            gdWethPool.setFeeBeneficiary(ubiSplitterAddr);
            gdUsdcPool.setFeeBeneficiary(ubiSplitterAddr);
            wethUsdcPool.setFeeBeneficiary(ubiSplitterAddr);
            console.log("UBI fee beneficiary set:", ubiSplitterAddr);
        }

        // ── 4. Seed liquidity ──────────────────────────────────────────────────

        // GoodPool constructor sorts tokens by address; _addLiquidity re-sorts
        // arguments to match the pool's canonical (tokenA, tokenB) order.
        IERC20(gdAddr).approve(address(gdWethPool), SEED_GD_FOR_WETH_POOL);
        IERC20(wethAddr).approve(address(gdWethPool), SEED_WETH_FOR_GD_POOL);
        _addLiquidity(gdWethPool, gdAddr, wethAddr,
            SEED_GD_FOR_WETH_POOL, SEED_WETH_FOR_GD_POOL, deployer);

        IERC20(gdAddr).approve(address(gdUsdcPool), SEED_GD_FOR_USDC_POOL);
        IERC20(usdcAddr).approve(address(gdUsdcPool), SEED_USDC_FOR_GD_POOL);
        _addLiquidity(gdUsdcPool, gdAddr, usdcAddr,
            SEED_GD_FOR_USDC_POOL, SEED_USDC_FOR_GD_POOL, deployer);

        IERC20(wethAddr).approve(address(wethUsdcPool), SEED_WETH_FOR_USDC_POOL);
        IERC20(usdcAddr).approve(address(wethUsdcPool), SEED_USDC_FOR_WETH_POOL);
        _addLiquidity(wethUsdcPool, wethAddr, usdcAddr,
            SEED_WETH_FOR_USDC_POOL, SEED_USDC_FOR_WETH_POOL, deployer);

        // ── 5. Summary ─────────────────────────────────────────────────────────

        console.log("");
        console.log("=== Initial Liquidity Pools Created ===");
        console.log("");
        console.log("Tokens:");
        console.log("  G$  :", gdAddr);
        console.log("  WETH:", wethAddr);
        console.log("  USDC:", usdcAddr);
        console.log("");
        console.log("Pools:");
        console.log("  G$/WETH   :", address(gdWethPool),  "(3,000,000 G$ + 1,000 WETH)");
        console.log("  G$/USDC   :", address(gdUsdcPool),  "(1,000,000 G$ + 1,000,000 USDC)");
        console.log("  WETH/USDC :", address(wethUsdcPool), "(1,000 WETH + 3,000,000 USDC)");
        console.log("");
        console.log("Add these to frontend/src/lib/chain.ts:");
        console.log("  GoodPoolGdWeth:  ", address(gdWethPool));
        console.log("  GoodPoolGdUsdc:  ", address(gdUsdcPool));
        console.log("  GoodPoolWethUsdc:", address(wethUsdcPool));
        console.log("");
        console.log("Next: upgrade pools to Uniswap V4 with UBIFeeHook once PoolManager is deployed.");
    }

    /**
     * @dev Helper that passes tokens in canonical (tokenA, tokenB) order.
     *      GoodPool sorts on construction; we re-sort here to match.
     */
    function _addLiquidity(
        GoodPool pool,
        address tok1,
        address tok2,
        uint256 amt1,
        uint256 amt2,
        address /* depositor */
    ) internal {
        // Match pool's canonical order
        if (tok1 < tok2) {
            // tok1=tokenA, tok2=tokenB
            pool.addLiquidity(amt1, amt2);
        } else {
            // tok2=tokenA, tok1=tokenB (re-approve may be needed — caller handles this)
            pool.addLiquidity(amt2, amt1);
        }
    }
}
