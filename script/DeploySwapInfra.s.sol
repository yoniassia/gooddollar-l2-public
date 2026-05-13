// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/swap/GoodSwapRouter.sol";

// ─── Minimal ERC-20 mock ──────────────────────────────────────────────────────

contract SwapMockERC20 {
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

// ─── GoodPool (x*y=k AMM) ────────────────────────────────────────────────────

interface IERC20Swap {
    function transferFrom(address, address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

contract SwapGoodPool {
    address public immutable tokenA;
    address public immutable tokenB;
    address public feeBeneficiary;
    address public owner;

    uint256 public reserveA;
    uint256 public reserveB;
    uint256 public totalLiquidity;
    mapping(address => uint256) public liquidity;

    uint256 constant FEE_BPS     = 30;    // 0.3% total fee
    uint256 constant UBI_FEE_BPS = 3333;  // 33.33% of fee → UBI
    uint256 constant BPS_DENOM   = 10_000;

    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 lp);
    event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 lp);
    event Swap(address indexed trader, address tokenIn, uint256 amountIn, uint256 amountOut, uint256 fee);

    constructor(address _tokenA, address _tokenB, address _owner) {
        require(_tokenA != _tokenB, "GoodPool: identical tokens");
        (tokenA, tokenB) = _tokenA < _tokenB ? (_tokenA, _tokenB) : (_tokenB, _tokenA);
        owner = _owner;
    }

    function setFeeBeneficiary(address beneficiary) external {
        require(msg.sender == owner, "GoodPool: not owner");
        feeBeneficiary = beneficiary;
    }

    function addLiquidity(uint256 amountA, uint256 amountB) external returns (uint256 lp) {
        require(amountA > 0 && amountB > 0, "GoodPool: zero amount");
        IERC20Swap(tokenA).transferFrom(msg.sender, address(this), amountA);
        IERC20Swap(tokenB).transferFrom(msg.sender, address(this), amountB);
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

    function removeLiquidity(uint256 lpAmount) external returns (uint256 outA, uint256 outB) {
        require(lpAmount > 0 && lpAmount <= liquidity[msg.sender], "GoodPool: bad lp amount");
        outA = (lpAmount * reserveA) / totalLiquidity;
        outB = (lpAmount * reserveB) / totalLiquidity;
        liquidity[msg.sender] -= lpAmount;
        totalLiquidity -= lpAmount;
        reserveA -= outA;
        reserveB -= outB;
        IERC20Swap(tokenA).transfer(msg.sender, outA);
        IERC20Swap(tokenB).transfer(msg.sender, outB);
        emit LiquidityRemoved(msg.sender, outA, outB, lpAmount);
    }

    function swap(address tokenIn, uint256 amountIn, uint256 minOut) external returns (uint256 amountOut) {
        require(tokenIn == tokenA || tokenIn == tokenB, "GoodPool: invalid token");
        require(amountIn > 0, "GoodPool: zero input");
        bool aToB = tokenIn == tokenA;
        (uint256 resIn, uint256 resOut) = aToB ? (reserveA, reserveB) : (reserveB, reserveA);
        address tokenOut = aToB ? tokenB : tokenA;

        IERC20Swap(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        uint256 fee = (amountIn * FEE_BPS) / BPS_DENOM;
        uint256 amountInAfterFee = amountIn - fee;

        amountOut = (resOut * amountInAfterFee) / (resIn + amountInAfterFee);
        require(amountOut >= minOut, "GoodPool: slippage exceeded");
        require(amountOut < resOut, "GoodPool: insufficient reserves");

        if (feeBeneficiary != address(0)) {
            uint256 ubiFee = (fee * UBI_FEE_BPS) / BPS_DENOM;
            if (ubiFee > 0) {
                IERC20Swap(tokenIn).transfer(feeBeneficiary, ubiFee);
                fee -= ubiFee;
            }
        }

        if (aToB) {
            reserveA += amountInAfterFee + fee;
            reserveB -= amountOut;
        } else {
            reserveB += amountInAfterFee + fee;
            reserveA -= amountOut;
        }

        IERC20Swap(tokenOut).transfer(msg.sender, amountOut);
        emit Swap(msg.sender, tokenIn, amountIn, amountOut, fee);
    }

    function getAmountOut(address tokenIn, uint256 amountIn) external view returns (uint256) {
        require(tokenIn == tokenA || tokenIn == tokenB, "GoodPool: invalid token");
        bool aToB = tokenIn == tokenA;
        (uint256 resIn, uint256 resOut) = aToB ? (reserveA, reserveB) : (reserveB, reserveA);
        uint256 amountInAfterFee = amountIn - (amountIn * FEE_BPS) / BPS_DENOM;
        return (resOut * amountInAfterFee) / (resIn + amountInAfterFee);
    }

    function spotPrice() external view returns (uint256) {
        if (reserveA == 0) return 0;
        return (reserveB * 1e18) / reserveA;
    }

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

/**
 * @title DeploySwapInfra
 * @notice Deploys the complete GoodSwap infrastructure:
 *         1. SwapMockERC20 tokens  — G$-Swap, WETH-Swap, USDC-Swap
 *         2. SwapGoodPool × 3     — G$/WETH, G$/USDC, WETH/USDC with seeded liquidity
 *         3. GoodSwapRouter       — with all 3 pools registered
 *
 *         UBI fee beneficiary is wired to the live UBIFeeSplitter on devnet.
 *
 * Usage (devnet):
 *   PRIVATE_KEY=<key> forge script script/DeploySwapInfra.s.sol \
 *     --rpc-url $DEVNET_RPC --broadcast --legacy
 */
contract DeploySwapInfra is Script {
    // ── Liquidity seed amounts ─────────────────────────────────────────────────
    uint256 constant SEED_GD_WETH_GD    = 3_000_000e18;   // 3M G$
    uint256 constant SEED_GD_WETH_WETH  =     1_000e18;   // 1K WETH
    uint256 constant SEED_GD_USDC_GD    = 1_000_000e18;   // 1M G$
    uint256 constant SEED_GD_USDC_USDC  = 1_000_000e6;    // 1M USDC (6 dec)
    uint256 constant SEED_WETH_USDC_WETH=     1_000e18;   // 1K WETH
    uint256 constant SEED_WETH_USDC_USDC= 3_000_000e6;    // 3M USDC (6 dec)

    // Live devnet UBIFeeSplitter (redeployed, GOO-243)
    address constant UBI_SPLITTER = 0x976fcd02f7C4773dd89C309fBF55D5923B4c98a1;

    function run() external {
        uint256 deployerKey = vm.envOr(
            "PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // ── 1. Deploy swap mock tokens ─────────────────────────────────────────
        SwapMockERC20 gd   = new SwapMockERC20("GoodDollar Swap", "G$-S",  18);
        SwapMockERC20 weth = new SwapMockERC20("Wrapped Ether",   "WETH",  18);
        SwapMockERC20 usdc = new SwapMockERC20("USD Coin",        "USDC",   6);

        // Mint seed amounts for deployer
        gd.mint(deployer,   SEED_GD_WETH_GD  + SEED_GD_USDC_GD);
        weth.mint(deployer, SEED_GD_WETH_WETH + SEED_WETH_USDC_WETH);
        usdc.mint(deployer, SEED_GD_USDC_USDC + SEED_WETH_USDC_USDC);

        // ── 2. Deploy pools ────────────────────────────────────────────────────
        SwapGoodPool poolGdWeth   = new SwapGoodPool(address(gd),   address(weth), deployer);
        SwapGoodPool poolGdUsdc   = new SwapGoodPool(address(gd),   address(usdc), deployer);
        SwapGoodPool poolWethUsdc = new SwapGoodPool(address(weth), address(usdc), deployer);

        // ── 3. Wire UBI fee beneficiary ────────────────────────────────────────
        poolGdWeth.setFeeBeneficiary(UBI_SPLITTER);
        poolGdUsdc.setFeeBeneficiary(UBI_SPLITTER);
        poolWethUsdc.setFeeBeneficiary(UBI_SPLITTER);

        // ── 4. Seed liquidity (sorted to match canonical tokenA/tokenB order) ──
        _addLiquidity(poolGdWeth,   address(gd),   address(weth), SEED_GD_WETH_GD,    SEED_GD_WETH_WETH);
        _addLiquidity(poolGdUsdc,   address(gd),   address(usdc), SEED_GD_USDC_GD,    SEED_GD_USDC_USDC);
        _addLiquidity(poolWethUsdc, address(weth), address(usdc), SEED_WETH_USDC_WETH, SEED_WETH_USDC_USDC);

        // ── 5. Deploy router and register pools ───────────────────────────────
        GoodSwapRouter router = new GoodSwapRouter(deployer);
        router.registerPool(address(poolGdWeth));
        router.registerPool(address(poolGdUsdc));
        router.registerPool(address(poolWethUsdc));

        vm.stopBroadcast();

        // ── Summary ────────────────────────────────────────────────────────────
        console.log("=== GoodSwap Infrastructure Deployed ===");
        console.log("");
        console.log("Tokens:");
        console.log("  SwapGD  :", address(gd));
        console.log("  SwapWETH:", address(weth));
        console.log("  SwapUSDC:", address(usdc));
        console.log("");
        console.log("Pools:");
        console.log("  G$/WETH  :", address(poolGdWeth));
        console.log("  G$/USDC  :", address(poolGdUsdc));
        console.log("  WETH/USDC:", address(poolWethUsdc));
        console.log("");
        console.log("Router:");
        console.log("  GoodSwapRouter:", address(router));
        console.log("");
        console.log("Update frontend/src/lib/devnet.ts:");
        console.log("  PoolManager:      (unchanged - no new pool manager)");
        console.log("  GoodSwapRouter:   ", address(router));
        console.log("  SwapPoolGdWeth:   ", address(poolGdWeth));
        console.log("  SwapPoolGdUsdc:   ", address(poolGdUsdc));
        console.log("  SwapPoolWethUsdc: ", address(poolWethUsdc));
        console.log("  SwapGD:           ", address(gd));
        console.log("  SwapWETH:         ", address(weth));
        console.log("  SwapUSDC:         ", address(usdc));
    }

    /// @dev Add liquidity in the correct canonical order (tokenA < tokenB by address).
    function _addLiquidity(
        SwapGoodPool pool,
        address tok1,
        address tok2,
        uint256 amt1,
        uint256 amt2
    ) internal {
        address tA = pool.tokenA();
        // approve both tokens from deployer to pool
        IERC20Swap(tok1).approve(address(pool), amt1);
        IERC20Swap(tok2).approve(address(pool), amt2);
        // addLiquidity expects (amountA, amountB) where A = tokenA
        if (tok1 == tA) {
            pool.addLiquidity(amt1, amt2);
        } else {
            pool.addLiquidity(amt2, amt1);
        }
    }
}
