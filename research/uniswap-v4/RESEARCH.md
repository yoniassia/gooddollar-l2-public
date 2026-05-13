# GoodSwap Research: Uniswap V4 + Li.Fi + Cross-Chain Integration

> **Author:** GoodClaw (AI Product Agent)  
> **Date:** 2026-04-03  
> **Status:** Comprehensive Research — Ready for Implementation  
> **Purpose:** Design GoodSwap as the native DEX for GoodDollar L2, powered by Uniswap V4 hooks with built-in UBI funding

---

## Table of Contents

1. [Uniswap V4 Architecture](#1-uniswap-v4-architecture)
2. [Hooks Deep Dive](#2-hooks-deep-dive)
3. [Pool Creation](#3-pool-creation)
4. [Router / Periphery](#4-router--periphery)
5. [Li.Fi SDK Integration](#5-lifi-sdk-integration)
6. [1inch Aggregation Protocol](#6-1inch-aggregation-protocol)
7. [Across Protocol (Fast Bridge)](#7-across-protocol-fast-bridge)
8. [GoodSwap Complete Plan](#8-goodswap-complete-plan)
9. [Deployment Scripts](#9-deployment-scripts)
10. [Risk Analysis & Mitigations](#10-risk-analysis--mitigations)

---

## 1. Uniswap V4 Architecture

### 1.1 Singleton PoolManager

Uniswap V4 introduces a radical architectural change: **all pools live in a single contract** (`PoolManager.sol`). This replaces V2/V3's factory pattern where each pool was a separate contract.

**Key benefits for GoodDollar L2:**
- **Gas savings:** Pool creation is a state update (~50K gas) instead of deploying a new contract (~4.5M gas)
- **No intermediate token transfers:** Multi-hop swaps (e.g., DAI → G$ → ETH) don't transfer tokens between pools
- **Simpler protocol tax:** Our UBIFeeHook gets called by the single PoolManager, not scattered across contracts

**Contract structure:**
```
PoolManager.sol
├── Pool state (mapping of PoolId → Pool.State)
├── Balance tracking (EIP-1153 transient storage)
├── Hook lifecycle dispatcher
└── ERC6909 claims (for gas-efficient token custody)
```

### 1.2 Flash Accounting (EIP-1153)

Flash accounting is the killer optimization in V4. Instead of transferring tokens at each step, V4 tracks **net deltas** in transient storage and only settles at the end.

**How it works:**

1. Caller invokes `poolManager.unlock(data)`
2. PoolManager calls back to `unlockCallback(data)` on the caller
3. Inside the callback, caller performs operations: `swap()`, `modifyLiquidity()`, `donate()`
4. Each operation updates internal deltas (credits/debits) — no token transfers
5. After all operations, caller **settles** debts (`settle()`) and **takes** credits (`take()`)
6. PoolManager verifies all deltas are zero — if not, the entire TX reverts

**Delta-resolving operations:**
| Operation | Effect |
|-----------|--------|
| `settle()` | Pay tokens to PoolManager, resolves negative deltas |
| `take()` | Withdraw tokens from PoolManager, resolves positive deltas |
| `mint()` | Mint ERC6909 claims (IOUs), creates negative delta |
| `burn()` | Burn ERC6909 claims, creates positive delta |
| `clear()` | Zero out small positive deltas (forfeit dust) |
| `sync()` | Sync the PoolManager's balance with actual token balance |

**Example: Multi-hop swap (ETH → USDC → G$)**
```
// V3: 3 token transfers (ETH→pool1, USDC→pool2, G$→user)
// V4: 2 token transfers (ETH→PM, G$→user) — USDC stays internal
```

### 1.3 Native ETH Support

V4 supports native ETH without WETH wrapping. This saves ~30K gas per swap involving ETH. Our G$/ETH pool uses native ETH.

### 1.4 ERC6909 Claims

Instead of transferring ERC-20 tokens out of the PoolManager, users can `mint()` ERC6909 claim tokens. These act as receipts/IOUs redeemable for the underlying token. Useful for:
- Liquidity providers who want to keep tokens in the PoolManager
- Protocols that compose multiple operations efficiently
- GoodSwap vault strategies that keep capital productive

---

## 2. Hooks Deep Dive

### 2.1 Hook Lifecycle

Hooks are external contracts attached to pools at initialization. The PoolManager calls hook functions at specific points in the lifecycle. A hook's **address encodes its permissions** — the last bytes of the address determine which callbacks are active.

**Complete hook callback list:**

| Callback | When Called | Use Case |
|----------|------------|----------|
| `beforeInitialize` | Before pool creation | Validate pool params, set custom state |
| `afterInitialize` | After pool creation | Initialize oracle, emit events |
| `beforeAddLiquidity` | Before LP deposit | Validate LPs, enforce KYC |
| `afterAddLiquidity` | After LP deposit | Auto-stake LP tokens, track positions |
| `beforeRemoveLiquidity` | Before LP withdrawal | Enforce lockup periods |
| `afterRemoveLiquidity` | After LP withdrawal | Cleanup state |
| `beforeSwap` | Before swap execution | Dynamic fees, MEV protection |
| `afterSwap` | After swap completion | **Fee collection for UBI**, oracle updates |
| `beforeDonate` | Before donation | Validate donor |
| `afterDonate` | After donation | Track donations |

### 2.2 Hook Address Mining

V4 encodes hook permissions in the contract address itself. Specific bits in the address correspond to enabled callbacks. To deploy a hook at the correct address, you must:

1. Calculate the required address flags based on desired callbacks
2. Use `CREATE2` with salt mining to deploy at a matching address
3. The PoolManager checks the hook address when `initialize()` is called

**For our UBIFeeHook (afterSwap only):**
```solidity
// The afterSwap flag is at bit position 7 (0x80 in the last byte)
// Hook address must have: address & uint160(0x80) != 0
// Example valid address: 0x...80, 0x...81, 0x...FF
```

### 2.3 How UBIFeeHook Fits

Our existing `UBIFeeHook.sol` implements `afterSwap`. Here's how it integrates with V4:

```
User → Router → PoolManager.unlock() → swap() → afterSwap(hook) → UBIFeeHook
                                                                    ├── Calculate UBI share (33.33%)
                                                                    ├── Route to UBIFeeSplitter
                                                                    └── Emit UBIFeeCollected
```

**Current implementation review (`src/hooks/UBIFeeHook.sol`):**
- ✅ Implements `afterSwap` callback
- ✅ Configurable fee share (3333 BPS = 33.33%)
- ✅ Routes to `UBIFeeSplitter` via `fundUBIPool()`
- ✅ Admin controls for fee adjustment, pause, pool address
- ⚠️ Uses minimal/custom V4 interfaces — needs migration to real V4-core imports
- ⚠️ Doesn't use V4's delta system for fee collection — needs refactor
- ⚠️ No `CREATE2` address mining — hook address won't pass V4 validation

**Required upgrades for production V4 integration:**

1. **Import real V4 types:** Replace custom structs with `v4-core/src/types/PoolKey.sol`, `BalanceDelta`, etc.
2. **Inherit BaseHook:** Use `v4-periphery/src/base/BaseHook.sol` for proper callback registration
3. **Use delta-based fee collection:** Instead of token transfers, use `poolManager.take()` to extract fees
4. **Mine correct address:** Deploy with `CREATE2` so address encodes `afterSwap` permission
5. **Return fee delta:** `afterSwap` can return a `BalanceDelta` that modifies the swap output (V4 custom accounting)

### 2.4 Upgraded UBIFeeHook Design

```solidity
contract UBIFeeHook is BaseHook {
    using PoolIdLibrary for PoolKey;

    uint256 public ubiFeeShareBPS = 3333; // 33.33%
    address public ubiFeeSplitter;

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,       // ← This is our entry point
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,  // ← We modify the output delta
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function afterSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) external override returns (bytes4, int128) {
        // Calculate UBI fee on the output token
        bool zeroForOne = params.zeroForOne;
        int128 outputDelta = zeroForOne ? delta.amount1() : delta.amount0();

        if (outputDelta <= 0) return (this.afterSwap.selector, 0);

        uint128 outputAmount = uint128(outputDelta);
        uint128 ubiShare = uint128((uint256(outputAmount) * ubiFeeShareBPS) / 10000);

        // Take the UBI share from the PoolManager
        Currency outputCurrency = zeroForOne ? key.currency1 : key.currency0;
        poolManager.take(outputCurrency, address(this), ubiShare);

        // Route to UBI pool
        IERC20(Currency.unwrap(outputCurrency)).approve(ubiFeeSplitter, ubiShare);
        IUBIFeeSplitter(ubiFeeSplitter).splitFee(ubiShare, address(this));

        // Return negative delta = reduce output to user by ubiShare
        return (this.afterSwap.selector, -int128(ubiShare));
    }
}
```

---

## 3. Pool Creation

### 3.1 Initializing a Pool

Pool creation in V4 is done by calling `PoolManager.initialize()`:

```solidity
function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
```

**PoolKey structure:**
```solidity
struct PoolKey {
    Currency currency0;   // Token with lower address (sorted)
    Currency currency1;   // Token with higher address (sorted)
    uint24 fee;           // Fee tier in hundredths of a bip (e.g., 3000 = 0.30%)
    int24 tickSpacing;    // Determines granularity of positions
    IHooks hooks;         // Hook contract address (or address(0) for no hooks)
}
```

**Key rules:**
- `currency0 < currency1` (addresses must be sorted)
- `fee` can be 0-1000000 (0% to 100%) for static fees, or `0x800000` flag for dynamic fees
- `tickSpacing` determines position granularity (common: 1, 10, 60, 200)
- `sqrtPriceX96` sets the initial price: `sqrt(price) * 2^96`

**Pool ID** is the keccak256 hash of the PoolKey. Same tokens + same fee + same tickSpacing + same hook = same pool.

### 3.2 Fee Tiers

V4 fee tiers differ from V3's fixed set (0.01%, 0.05%, 0.30%, 1.00%). V4 allows **any fee** up to 100%.

For GoodSwap, recommended fee tiers:
| Pool | Fee | Tick Spacing | Rationale |
|------|-----|-------------|-----------|
| G$/ETH | 3000 (0.30%) | 60 | Standard volatile pair |
| G$/USDC | 3000 (0.30%) | 60 | G$ is volatile vs stables |
| ETH/USDC | 500 (0.05%) | 10 | Blue-chip pair, tight spreads |
| G$/DAI | 3000 (0.30%) | 60 | Standard volatile pair |

### 3.3 Setting Initial Price

The `sqrtPriceX96` parameter encodes the initial price:

```
sqrtPriceX96 = sqrt(price) * 2^96

For G$/USDC where 1 G$ = $0.00002:
  price = 0.00002 (USDC per G$)
  sqrtPriceX96 = sqrt(0.00002) * 2^96 ≈ 354,105,546,088,128 (3.54e14)

For ETH/USDC where 1 ETH = $3500:
  price = 3500
  sqrtPriceX96 = sqrt(3500) * 2^96 ≈ 4,688,088,259,057,244,160 (4.69e18)
```

### 3.4 Adding Initial Liquidity

After pool initialization, liquidity is added via `PoolManager.modifyLiquidity()` inside an unlock callback:

```solidity
function modifyLiquidity(
    PoolKey memory key,
    ModifyLiquidityParams memory params,
    bytes calldata hookData
) external returns (BalanceDelta, BalanceDelta);

struct ModifyLiquidityParams {
    int24 tickLower;     // Lower bound of position
    int24 tickUpper;     // Upper bound of position
    int256 liquidityDelta; // Positive = add, negative = remove
    bytes32 salt;        // Unique identifier for the position
}
```

For full-range liquidity: `tickLower = -887220, tickUpper = 887220` (with tickSpacing=60).

---

## 4. Router / Periphery

### 4.1 Architecture Layers

```
User/Frontend
    ↓
Universal Router (or custom GoodSwap Router)
    ↓
PoolManager.unlock()
    ↓
unlockCallback() → swap() / modifyLiquidity() / donate()
    ↓
Hook callbacks (UBIFeeHook.afterSwap)
    ↓
settle() / take() — actual token transfers
```

### 4.2 v4-periphery Contracts

The `v4-periphery` repo provides:

1. **PositionManager** — Manages LP positions as ERC-721 NFTs (like V3's NonfungiblePositionManager)
2. **PoolSwapTest** — Simple swap router for testing
3. **PoolModifyLiquidityTest** — Simple liquidity router for testing
4. **SafeCallback** — Abstract contract for safe `unlockCallback` implementation
5. **BaseHook** — Base contract for hook development

### 4.3 GoodSwap Router Design

We need a custom router that:
1. Handles swaps through our hooked pools
2. Supports multi-hop routing (DAI → G$ → ETH)
3. Integrates with Li.Fi for cross-chain settlement
4. Provides slippage protection

```solidity
contract GoodSwapRouter is SafeCallback {
    function swap(
        PoolKey calldata key,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        uint256 deadline
    ) external returns (BalanceDelta) {
        require(block.timestamp <= deadline, "Expired");
        bytes memory data = abi.encode(msg.sender, key, zeroForOne, amountSpecified, sqrtPriceLimitX96);
        return abi.decode(poolManager.unlock(data), (BalanceDelta));
    }

    function _unlockCallback(bytes calldata data) internal override returns (bytes memory) {
        (address sender, PoolKey memory key, bool zeroForOne, int256 amountSpecified, uint160 limit)
            = abi.decode(data, (address, PoolKey, bool, int256, uint160));

        BalanceDelta delta = poolManager.swap(
            key,
            IPoolManager.SwapParams(zeroForOne, amountSpecified, limit),
            ""
        );

        // Settle input (transfer tokens to PoolManager)
        // Take output (transfer tokens from PoolManager to user)
        _settleDelta(sender, key, delta);

        return abi.encode(delta);
    }
}
```

### 4.4 Universal Router

Uniswap's Universal Router handles complex multi-protocol swaps (V2, V3, V4) in a single transaction. For GoodSwap, we could:
- **Option A:** Deploy the full Universal Router (complex, supports all Uniswap versions)
- **Option B:** Build a minimal GoodSwapRouter (simpler, V4-only, GoodDollar-optimized)

**Recommendation:** Start with Option B (custom router), add Universal Router later for ecosystem compatibility.

---

## 5. Li.Fi SDK Integration

### 5.1 Overview

Li.Fi (LI.FI) is a cross-chain swap and bridge aggregator supporting **58+ blockchains**, **27+ bridges**, and **31+ DEXs**. It finds the optimal route for any-to-any token transfers across chains.

### 5.2 Key Features for GoodSwap

- **Any chain → GoodDollar L2:** Users can swap tokens on Ethereum, Arbitrum, Polygon, etc. and receive G$ on GoodDollar L2
- **Best route optimization:** Aggregates bridges (Across, Stargate, Hop, etc.) and DEXs (Uniswap, 1inch, etc.)
- **Destination chain contract calls:** Execute arbitrary calls on the destination chain after bridging
- **Status tracking:** Poll transfer status across chains

### 5.3 Integration Architecture

```
User on Ethereum                             GoodDollar L2
    │                                              │
    ├── Li.Fi SDK: getQuote()                      │
    │   (ETH on Ethereum → G$ on GoodDollar L2)   │
    │                                              │
    ├── Li.Fi SDK: executeRoute()                  │
    │   ├── Swap ETH → USDC on Ethereum            │
    │   ├── Bridge USDC via Across/Stargate        │
    │   │                                          │
    │   └── ─── ─── bridge ─── ─── ─── ──→       │
    │                                     ├── Receive USDC
    │                                     ├── Swap USDC → G$ on GoodSwap
    │                                     └── G$ delivered to user
    │                                              │
    └── Li.Fi: checkStatus(txHash)                 │
```

### 5.4 SDK Usage

**Installation:**
```bash
npm install @lifi/sdk
```

**Configuration:**
```typescript
import { createConfig } from '@lifi/sdk'

createConfig({
  integrator: 'GoodSwap',
  // Custom RPC for GoodDollar L2
  rpcUrls: {
    [GOODDOLLAR_L2_CHAIN_ID]: ['https://rpc.gooddollar.org']
  }
})
```

**Cross-chain swap quote:**
```typescript
import { getQuote, ChainId } from '@lifi/sdk'

const quote = await getQuote({
  fromAddress: userAddress,
  fromChain: ChainId.ETH,              // Ethereum mainnet
  toChain: GOODDOLLAR_L2_CHAIN_ID,     // GoodDollar L2
  fromToken: '0x0000...0000',          // Native ETH
  toToken: G_DOLLAR_ADDRESS,           // G$ on GoodDollar L2
  fromAmount: '1000000000000000000',   // 1 ETH in wei
})

// quote.transactionRequest is ready to sign and send
```

**Execute and track:**
```typescript
import { executeRoute, getStatus } from '@lifi/sdk'

// Execute the swap+bridge
const route = await executeRoute(quote, {
  updateRouteHook: (route) => {
    console.log('Route update:', route.steps[0].execution?.status)
  }
})

// Poll status
const status = await getStatus({
  txHash: route.steps[0].execution.process[0].txHash,
  fromChain: ChainId.ETH,
  toChain: GOODDOLLAR_L2_CHAIN_ID,
  bridge: route.steps[0].tool,
})
// status.status: 'PENDING' | 'DONE' | 'FAILED'
```

### 5.5 REST API (for AI Agents / Backend)

Li.Fi recommends the REST API for backend/agent use:

```bash
# Get quote
GET https://li.quest/v1/quote?fromChain=1&toChain=<GD_L2_ID>&fromToken=0x0000...&toToken=<G$>&fromAmount=1000000000000000000&fromAddress=0x...

# Check status
GET https://li.quest/v1/status?txHash=0x...&fromChain=1&toChain=<GD_L2_ID>

# List supported chains
GET https://li.quest/v1/chains

# List supported tokens
GET https://li.quest/v1/tokens?chains=1,<GD_L2_ID>
```

**Rate limits:** 200 req/2h without API key, 200 req/min with key. Request a key at li.fi.

### 5.6 Requirements for GoodDollar L2 Support

For Li.Fi to support GoodDollar L2:
1. **Chain registration:** Submit chain metadata (chain ID, RPC, block explorer)
2. **Bridge support:** At least one bridge must support GoodDollar L2 (Across, Stargate, or native bridge)
3. **DEX support:** GoodSwap (our Uniswap V4 deployment) must be indexed
4. **Liquidity:** Sufficient liquidity in GoodSwap pools for routing

**Action items:**
- [ ] Register GoodDollar L2 with Li.Fi
- [ ] Ensure native L1↔L2 bridge works (we have `GoodDollarBridgeL1.sol` + `GoodDollarBridgeL2.sol`)
- [ ] Deploy GoodSwap and bootstrap liquidity
- [ ] Submit GoodSwap router contract for Li.Fi DEX indexing

---

## 6. 1inch Aggregation Protocol

### 6.1 Overview

1inch is a DEX aggregator that splits trades across multiple liquidity sources to find the best rates. Unlike Li.Fi (cross-chain), 1inch focuses on **same-chain optimization**.

### 6.2 How 1inch Aggregation Works

```
User wants to swap 10,000 USDC → G$
    │
    ├── 1inch Pathfinder algorithm:
    │   ├── Check GoodSwap (Uniswap V4): 10K USDC → 480M G$
    │   ├── Check any other DEX on GoodDollar L2: (none initially)
    │   └── Optimal split: 100% via GoodSwap
    │
    └── 1inch Router executes the trade
        └── Single-source: GoodSwap swap
```

### 6.3 Integration with GoodSwap

**Phase 1 (Launch):** 1inch aggregation has limited value since GoodSwap will be the only DEX on GoodDollar L2. But registering early ensures:
- GoodSwap appears in 1inch's routing when other DEXs launch on GoodDollar L2
- Users who use 1inch's frontend/API can access GoodSwap liquidity

**Phase 2 (Ecosystem Growth):** As more DEXs deploy on GoodDollar L2:
- 1inch splits trades across GoodSwap + other DEXs
- Better rates for large trades
- GoodSwap's UBI fee is factored into routing (users see net-of-fee rates)

### 6.4 1inch API for GoodSwap

```bash
# Get swap quote
GET https://api.1inch.dev/swap/v6.0/<CHAIN_ID>/quote?src=<USDC>&dst=<G$>&amount=10000000000

# Get swap transaction
GET https://api.1inch.dev/swap/v6.0/<CHAIN_ID>/swap?src=<USDC>&dst=<G$>&amount=10000000000&from=<USER>&slippage=1
```

### 6.5 Fusion Mode

1inch Fusion allows gasless swaps via limit orders filled by resolvers. This could enable:
- Gasless G$ purchases on GoodDollar L2
- Professional market makers filling orders
- MEV protection for large trades

---

## 7. Across Protocol (Fast Bridge)

### 7.1 Overview

Across is an optimistic bridge using an intent-based architecture. It's the fastest bridge in the ecosystem (typically <1 minute for transfers).

### 7.2 How Across Works

```
1. User deposits USDC on Ethereum with intent: "Send USDC to GoodDollar L2"
2. Relayer on GoodDollar L2 fronts the USDC immediately (~seconds)
3. User receives tokens on GoodDollar L2 almost instantly
4. Relayer is reimbursed from Across's liquidity pool after optimistic verification
```

**Key architecture:**
- **SpokePool contracts** on each chain handle deposits and fills
- **HubPool** on Ethereum L1 manages liquidity and rebalancing
- **Relayers** compete to fill intents, providing fast execution
- **UMA oracle** verifies fills optimistically

### 7.3 Integration with GoodSwap

Across can be GoodDollar L2's primary fast bridge:

1. **Deploy SpokePool** on GoodDollar L2
2. **Register with Across** — submit chain metadata
3. **Relayer network** fills deposits on GoodDollar L2
4. **Li.Fi routes through Across** when it's the fastest/cheapest option

**Cross-chain swap flow with Across:**
```
User on Arbitrum:
  1. Swap ARB → USDC on Arbitrum (via 1inch/Uniswap)
  2. Bridge USDC via Across (Arbitrum → GoodDollar L2)
  3. Receive USDC on GoodDollar L2
  4. Swap USDC → G$ on GoodSwap (UBI fee taken)
  5. G$ in user's wallet
```

**With Li.Fi, steps 1-5 are a single SDK call.**

### 7.4 Requirements

- [ ] Deploy Across SpokePool on GoodDollar L2
- [ ] Seed liquidity pool for USDC/ETH on the HubPool
- [ ] Attract relayers (or run our own initially)
- [ ] Register chain with Across governance

---

## 8. GoodSwap Complete Plan

### 8.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GoodDollar L2                               │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐   │
│  │  PoolManager  │   │  GoodSwapRouter  │   │   PositionManager │   │
│  │  (Singleton)  │◄──│  (Swap Handler)  │   │  (LP NFTs)       │   │
│  │               │   └──────────────────┘   └──────────────────┘   │
│  │  Pools:       │                                                  │
│  │  ├─ G$/ETH    │   ┌──────────────────┐                          │
│  │  ├─ G$/USDC   │◄──│   UBIFeeHook     │──┐                      │
│  │  ├─ ETH/USDC  │   │  (afterSwap)     │  │                      │
│  │  └─ G$/DAI    │   └──────────────────┘  │                      │
│  └──────────────┘                           ▼                      │
│                                   ┌──────────────────┐             │
│                                   │  UBIFeeSplitter   │             │
│                                   │  33% → UBI Pool   │             │
│                                   │  17% → Treasury   │             │
│                                   │  50% → LPs        │             │
│                                   └──────────────────┘             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │              Cross-Chain Layer                             │      │
│  │  ┌────────┐  ┌────────────┐  ┌───────────────────────┐  │      │
│  │  │ Native │  │   Across   │  │ Li.Fi Diamond Contract │  │      │
│  │  │ Bridge │  │  SpokePool │  │ (aggregated routing)   │  │      │
│  │  └────────┘  └────────────┘  └───────────────────────┘  │      │
│  └──────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
                    ▲              ▲              ▲
                    │              │              │
        ┌───────────┘    ┌────────┘    ┌────────┘
        │                │              │
   Ethereum L1      Arbitrum        Polygon, Base, etc.
   (Native Bridge)  (Across)        (Li.Fi aggregated)
```

### 8.2 Contract Deployment Plan

**Phase 1: Core DEX (Week 1-2)**

| Contract | Description | Priority |
|----------|-------------|----------|
| `PoolManager` | Uniswap V4 singleton (deploy from v4-core) | P0 |
| `PositionManager` | LP position NFTs (from v4-periphery) | P0 |
| `GoodSwapRouter` | Custom swap router | P0 |
| `UBIFeeHook` | Fee hook (upgraded for real V4) | P0 |
| `PoolInitializer` | Script to create initial pools | P0 |

**Phase 2: Liquidity & Oracle (Week 2-3)**

| Contract | Description | Priority |
|----------|-------------|----------|
| `GoodSwapOracle` | TWAP oracle from pool observations | P1 |
| `LiquidityBootstrap` | Seed liquidity with protocol-owned G$ | P1 |
| `FeeCollector` | Aggregate and distribute collected fees | P1 |

**Phase 3: Cross-Chain (Week 3-4)**

| Integration | Description | Priority |
|-------------|-------------|----------|
| Li.Fi chain registration | Register GoodDollar L2 | P1 |
| Li.Fi DEX registration | Register GoodSwap router | P1 |
| Across SpokePool | Fast bridge deployment | P2 |
| 1inch integration | DEX aggregation listing | P2 |

### 8.3 Initial Pools

| Pool | Token0 | Token1 | Fee | Tick Spacing | Initial Price | Seed Liquidity |
|------|--------|--------|-----|-------------|---------------|----------------|
| G$/ETH | G$ | WETH | 3000 | 60 | 1 ETH = 50M G$ | 100M G$ + 2 ETH |
| G$/USDC | G$ | USDC | 3000 | 60 | 1 USDC = 50K G$ | 100M G$ + 2K USDC |
| ETH/USDC | WETH | USDC | 500 | 10 | 1 ETH = 3500 USDC | 5 ETH + 17.5K USDC |
| G$/DAI | G$ | DAI | 3000 | 60 | 1 DAI = 50K G$ | 50M G$ + 1K DAI |

**Total seed liquidity needed:** ~250M G$ + ~7 ETH + ~20.5K stablecoins

### 8.4 UBIFeeHook as Default Hook

**Every pool on GoodSwap uses the UBIFeeHook.** This is enforced by:

1. **Pool creation policy:** Our `PoolInitializer` creates all official pools with the hook
2. **Frontend/router:** Only routes through hooked pools
3. **Social contract:** Hook-less pools don't get Li.Fi / 1inch routing

**Fee flow for a 1000 USDC → G$ swap:**
```
1. User swaps 1000 USDC → ~50M G$ (0.30% pool fee = 3 USDC equivalent)
2. afterSwap fires on UBIFeeHook
3. UBI share: 33.33% of 3 USDC ≈ 1 USDC worth of G$ → UBIFeeSplitter
4. UBIFeeSplitter routes:
   - 33.33% → UBI Pool (fundUBIPool) = ~0.33 USDC worth
   - 16.67% → Protocol Treasury = ~0.17 USDC worth
   - 50% → Back to LP fees = ~0.50 USDC worth
```

Wait — clarification on fee flow. The pool fee (0.30%) goes to LPs naturally in Uniswap V4. Our UBIFeeHook takes an **additional** cut from the output:

**Corrected fee flow:**
```
1. User swaps 1000 USDC → 50M G$ (pool retains 0.30% for LPs)
2. afterSwap: UBIFeeHook takes 33.33% of OUTPUT as UBI tax
3. User receives: 50M G$ × (1 - 0.3333) ≈ 33.3M G$
4. UBI share: ~16.7M G$ → UBIFeeSplitter → UBI Pool
```

**This is too aggressive.** A 33% tax on output is massive. Better design:

**Recommended fee structure:**
```
Pool fee: 0.30% (goes to LPs)
UBI hook fee: additional 0.10% of swap output → UBIFeeSplitter
  - UBI Pool: 33.33% of 0.10% = ~0.033%
  - Treasury: 16.67% of 0.10% = ~0.017%
  - Protocol: 50% of 0.10% = ~0.05%

Total user cost: 0.30% (LP) + 0.10% (UBI) = 0.40% — competitive with other DEXs
```

Or alternatively, the hook takes 33% of the **LP fee** (not the output):
```
Pool fee: 0.30%
  - 67% stays with LPs = 0.20%
  - 33% goes to UBIFeeSplitter = 0.10%
    - UBI Pool: 33.33% = 0.033%
    - Treasury: 16.67% = 0.017%
    - Protocol: 50% = 0.05%
```

**Recommendation:** Take 33% of the LP fee, not the output. This keeps user-facing costs at 0.30% (standard) while funding UBI. LPs earn 0.20% instead of 0.30% — still competitive.

### 8.5 TWAP Oracle

Uniswap V4 doesn't include built-in TWAP oracles (V3 had them). Instead, oracles are implemented as hooks.

**GoodSwap Oracle Hook:**
```solidity
contract GoodSwapOracle is BaseHook {
    // Store observations on each swap
    struct Observation {
        uint32 blockTimestamp;
        int56 tickCumulative;
        uint160 secondsPerLiquidityCumulativeX128;
    }

    mapping(PoolId => Observation[]) public observations;

    function afterSwap(...) external override {
        // Record tick observation
        observations[poolId].push(Observation({
            blockTimestamp: uint32(block.timestamp),
            tickCumulative: currentTickCumulative,
            ...
        }));
    }

    function consult(PoolId poolId, uint32 secondsAgo) external view returns (int24 arithmeticMeanTick) {
        // Calculate TWAP over the requested period
    }
}
```

**Note:** Since each pool can only have ONE hook, we need to either:
1. Combine oracle + UBI fee in a single hook contract
2. Use the oracle separately and have the hook call it

**Recommendation:** Combine into `UBIFeeOracleHook` — a single hook that does afterSwap fee collection AND oracle observation recording.

### 8.6 Li.Fi Cross-Chain Integration

**User journey: "I have ETH on Arbitrum and want G$ on GoodDollar L2"**

```
Frontend (Good Wallet):
  1. User selects: ETH (Arbitrum) → G$ (GoodDollar L2)
  2. Frontend calls Li.Fi getQuote()
  3. Li.Fi returns optimal route:
     - Swap ETH → USDC on Arbitrum via Uniswap
     - Bridge USDC via Across (Arbitrum → GoodDollar L2)
     - Swap USDC → G$ on GoodSwap
  4. User signs one transaction
  5. Li.Fi executes the multi-step route
  6. Frontend polls status via Li.Fi getStatus()
  7. User receives G$ on GoodDollar L2
```

**Li.Fi with destination chain contract call:**
```typescript
const quote = await getQuote({
  fromAddress: userAddress,
  fromChain: ChainId.ARB,
  toChain: GOODDOLLAR_L2_CHAIN_ID,
  fromToken: ETH_ADDRESS,
  toToken: USDC_ADDRESS,  // Bridge USDC, then...
  fromAmount: ethAmount,
  // Execute swap on destination after bridge
  contractCalls: [{
    fromToken: USDC_ADDRESS,
    toToken: G_DOLLAR_ADDRESS,
    fromAmount: estimatedUsdcAmount,
    callTo: GOODSWAP_ROUTER_ADDRESS,
    callData: goodSwapRouter.interface.encodeFunctionData('swap', [
      poolKey, true, amountSpecified, sqrtPriceLimitX96, deadline
    ]),
  }]
})
```

---

## 9. Deployment Scripts

See the Foundry scripts in `/script/`:

- **`DeployGoodSwap.s.sol`** — Deploys PoolManager, Router, and UBIFeeHook
- **`CreatePools.s.sol`** — Creates initial pools (G$/ETH, G$/USDC, ETH/USDC, G$/DAI)
- **`AddSeedLiquidity.s.sol`** — Adds initial liquidity to all pools

### 9.1 Deployment Order

```bash
# 1. Deploy core contracts
forge script script/DeployGoodSwap.s.sol --rpc-url $RPC_URL --broadcast

# 2. Create pools
forge script script/CreatePools.s.sol --rpc-url $RPC_URL --broadcast

# 3. Add seed liquidity
forge script script/AddSeedLiquidity.s.sol --rpc-url $RPC_URL --broadcast
```

---

## 10. Risk Analysis & Mitigations

### 10.1 Smart Contract Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| V4 PoolManager bug | Critical | Use audited v4-core; monitor Uniswap security advisories |
| UBIFeeHook reentrancy | High | Use ReentrancyGuard; hook only called by PoolManager |
| Hook address mining collision | Medium | Thorough testing of CREATE2 deployment |
| Flash loan attacks on oracle | Medium | Use multi-block TWAP; add manipulation resistance |

### 10.2 Economic Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Low liquidity / high slippage | High | Protocol-owned liquidity; incentivize LPs |
| UBI fee discourages trading | Medium | Keep fee at 0.10% (competitive); emphasize social impact |
| Impermanent loss for G$/stable LPs | Medium | G$ emission schedule awareness; concentrated LP ranges |
| Price manipulation of G$ | High | Oracle uses TWAP; circuit breakers on extreme moves |

### 10.3 Operational Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Li.Fi doesn't support GoodDollar L2 | Medium | Use native bridge as fallback; engage Li.Fi team early |
| Across relayers don't serve our chain | Medium | Run our own relayer initially |
| 1inch doesn't index GoodSwap | Low | 1inch is nice-to-have; our own router handles all swaps |

### 10.4 License Considerations

- **Uniswap V4 Core:** BUSL-1.1 (Business Source License) — restricts commercial forks for 4 years. Deploying on GoodDollar L2 as-is should be fine (we're using it, not forking). Consult legal.
- **Uniswap V4 Periphery:** GPL 2.0 — our custom router must also be GPL if it links to periphery code.
- **Li.Fi SDK:** Check license; likely MIT/Apache.

---

## Appendix A: Key Contract Addresses (to be filled post-deployment)

| Contract | Address | Chain |
|----------|---------|-------|
| PoolManager | `TBD` | GoodDollar L2 |
| GoodSwapRouter | `TBD` | GoodDollar L2 |
| UBIFeeHook | `TBD` | GoodDollar L2 |
| PositionManager | `TBD` | GoodDollar L2 |
| G$ Token | `TBD` | GoodDollar L2 |
| USDC | `TBD` | GoodDollar L2 |
| WETH | `TBD` | GoodDollar L2 |
| DAI | `TBD` | GoodDollar L2 |

## Appendix B: References

- [Uniswap V4 Core](https://github.com/Uniswap/v4-core)
- [Uniswap V4 Periphery](https://github.com/Uniswap/v4-periphery)
- [Uniswap V4 Whitepaper](https://app.uniswap.org/whitepaper-v4.pdf)
- [Uniswap V4 Docs](https://docs.uniswap.org/contracts/v4/overview)
- [Li.Fi SDK](https://github.com/lifinance/sdk)
- [Li.Fi Docs](https://docs.li.fi/sdk/overview)
- [Li.Fi Agent Integration](https://docs.li.fi/agents/overview)
- [Across Protocol](https://across.to)
- [1inch Aggregation](https://1inch.io)
- [EIP-1153: Transient Storage](https://eips.ethereum.org/EIPS/eip-1153)
