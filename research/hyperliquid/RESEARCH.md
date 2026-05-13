# GoodPerps Research: Hyperliquid, dYdX v4 & GMX v2

> Comprehensive analysis for building perpetual futures on GoodDollar L2
> Date: 2026-04-03

---

## Table of Contents

1. [Hyperliquid Architecture](#1-hyperliquid-architecture)
2. [Hyperliquid API](#2-hyperliquid-api)
3. [dYdX v4 Architecture](#3-dydx-v4-architecture)
4. [GMX v2 Architecture](#4-gmx-v2-architecture)
5. [Comparison Table](#5-comparison-table)
6. [GoodPerps Backend Design](#6-goodperps-backend-design)
7. [Implementation Plan](#7-implementation-plan)
8. [Backend Code Reference](#8-backend-code-reference)

---

## 1. Hyperliquid Architecture

### Overview

Hyperliquid is a purpose-built L1 blockchain optimized for on-chain trading. It runs a custom consensus algorithm (HyperBFT, inspired by HotStuff) and supports 200K orders/second with sub-second block finality.

### Core Components

#### HyperBFT Consensus
- Custom BFT consensus derived from HotStuff and successors
- Optimized networking stack for high-throughput order processing
- Single-block finality — every trade is final once included in a block
- Validator set with staked HYPE tokens for economic security

#### HyperCore (Native Trading Engine)
- **Fully on-chain order book**: Every order, cancel, trade, and liquidation happens on-chain
- **Central Limit Order Book (CLOB)**: Price-time priority matching
- Supports both perpetual futures and spot trading
- State is deterministically computed by all validators
- 200K orders/second throughput (and growing with optimizations)

#### HyperEVM
- General-purpose EVM execution environment running alongside HyperCore
- Smart contracts can interact with HyperCore liquidity
- Permissionless — anyone can deploy contracts that use native order book liquidity
- Shares state and finality with HyperCore

### Order Book Design

```
┌─────────────────────────────────────────┐
│           HyperBFT Consensus            │
│    (All validators agree on state)      │
├─────────────────────────────────────────┤
│              HyperCore                  │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │  Order Book  │  │ Clearing Engine │   │
│  │  (CLOB)     │  │  (Margin/PnL)   │   │
│  └──────┬──────┘  └───────┬─────────┘   │
│         │                 │             │
│  ┌──────┴─────────────────┴──────┐      │
│  │    Matching Engine            │      │
│  │  (Price-time priority)        │      │
│  └───────────────────────────────┘      │
├─────────────────────────────────────────┤
│              HyperEVM                   │
│  (EVM smart contracts, composable)      │
└─────────────────────────────────────────┘
```

### Clearing System

- **Cross-margin**: Default mode; all positions share one margin pool
- **Isolated margin**: Per-position margin allocation
- **Mark price**: Derived from oracle prices + EMA of basis (mark vs index)
- **Funding rate**: Calculated every hour, paid continuously; based on premium of mark vs index
- **Liquidations**: Positions liquidated when margin ratio falls below maintenance margin
  - Liquidation is market order against the book
  - "Backstop" mechanism if book liquidity insufficient
- **Insurance fund**: Absorbs losses from negative-equity liquidations

### Vaults (HLP)

- **Hyperliquidity Provider (HLP)**: Protocol-run market-making vault
- Users deposit USDC into HLP vault; vault provides two-sided liquidity
- Vault PnL is socialized across depositors pro-rata
- Anyone can create custom vaults with their own strategies
- Vault leader trades on behalf of depositors; 10% profit share to leader
- Vaults inherit the same margin/clearing rules as individual accounts

### Key Metrics (as of 2026)
- ~$5B+ daily volume
- 200+ perpetual markets
- Sub-second finality
- ~0.02% taker fee, ~0.005% maker rebate

---

## 2. Hyperliquid API

### Base URLs

| Network  | REST                           | WebSocket                         |
|----------|--------------------------------|-----------------------------------|
| Mainnet  | `https://api.hyperliquid.xyz`  | `wss://api.hyperliquid.xyz/ws`    |
| Testnet  | `https://api.hyperliquid-testnet.xyz` | `wss://api.hyperliquid-testnet.xyz/ws` |

### REST API — Info Endpoint

All info requests are `POST https://api.hyperliquid.xyz/info` with JSON body.

#### Key Endpoints

| Request Type | Description | Key Fields |
|---|---|---|
| `allMids` | Mid prices for all coins | Returns `Record<string, string>` |
| `meta` | Perpetual metadata (universe of assets) | Asset names, indices, specs |
| `metaAndAssetCtxs` | Meta + live context (funding, OI, mark) | Combined meta + live data |
| `openOrders` | User's open orders | `user` address required |
| `frontendOpenOrders` | Open orders with extra display info | Includes `orderType`, `origSz` |
| `userFills` | User's recent fills (max 2000) | Trade history with PnL |
| `userFillsByTime` | Fills within time range | Paginated by timestamp |
| `clearinghouseState` | User's margin state | Positions, margin, account value |
| `l2Book` | Order book snapshot | `coin` required, returns bids/asks |
| `candleSnapshot` | OHLCV candles | `coin`, `interval`, `startTime`, `endTime` |

#### Example: Get All Mid Prices
```bash
curl -X POST https://api.hyperliquid.xyz/info \
  -H "Content-Type: application/json" \
  -d '{"type": "allMids"}'
# Response: {"BTC": "65432.5", "ETH": "3456.7", ...}
```

#### Example: Get L2 Order Book
```bash
curl -X POST https://api.hyperliquid.xyz/info \
  -H "Content-Type: application/json" \
  -d '{"type": "l2Book", "coin": "BTC"}'
# Response: {"levels": [[{px, sz, n}, ...], [{px, sz, n}, ...]]}
```

### REST API — Exchange Endpoint

All trading actions are `POST https://api.hyperliquid.xyz/exchange` with signed JSON body.

#### Key Actions

| Action Type | Description | Auth Required |
|---|---|---|
| `order` | Place limit/market/trigger orders | Yes (EIP-712 signature) |
| `cancel` | Cancel orders by oid | Yes |
| `cancelByCloid` | Cancel orders by client order ID | Yes |
| `batchModify` | Modify multiple orders atomically | Yes |
| `updateLeverage` | Set leverage for an asset | Yes |
| `updateIsolatedMargin` | Add/remove isolated margin | Yes |
| `usdTransfer` | Transfer USDC between accounts | Yes |

#### Order Structure
```json
{
  "action": {
    "type": "order",
    "orders": [{
      "a": 0,          // asset index (0 = BTC)
      "b": true,        // isBuy
      "p": "65000.0",   // price
      "s": "0.01",      // size
      "r": false,       // reduceOnly
      "t": {"limit": {"tif": "Gtc"}},
      "c": "0x..."      // optional client order ID
    }],
    "grouping": "na"
  },
  "nonce": 1712345678000,
  "signature": {...}
}
```

### WebSocket API

Connect to `wss://api.hyperliquid.xyz/ws` and send subscription messages.

#### Available Subscriptions

| Channel | Message | Data |
|---|---|---|
| `allMids` | `{"type": "allMids"}` | All mid prices, updated per block |
| `l2Book` | `{"type": "l2Book", "coin": "BTC"}` | Order book snapshots (every 0.5s) |
| `trades` | `{"type": "trades", "coin": "BTC"}` | Real-time trade stream |
| `candle` | `{"type": "candle", "coin": "BTC", "interval": "1m"}` | Candle updates |
| `bbo` | `{"type": "bbo", "coin": "BTC"}` | Best bid/offer (on change) |
| `clearinghouseState` | `{"type": "clearinghouseState", "user": "0x..."}` | User margin state |
| `openOrders` | `{"type": "openOrders", "user": "0x..."}` | User order updates |
| `userFills` | `{"type": "userFills", "user": "0x..."}` | Real-time fill stream |
| `userFundings` | `{"type": "userFundings", "user": "0x..."}` | Funding payments |
| `orderUpdates` | `{"type": "orderUpdates", "user": "0x..."}` | Order status changes |
| `activeAssetCtx` | `{"type": "activeAssetCtx", "coin": "BTC"}` | Funding rate, OI, mark |

#### Key Data Types
```typescript
interface WsTrade {
  coin: string;
  side: string;    // "B" or "A"
  px: string;
  sz: string;
  hash: string;
  time: number;
  tid: number;
}

interface WsBook {
  coin: string;
  levels: [WsLevel[], WsLevel[]]; // [bids, asks]
  time: number;
}

interface WsLevel {
  px: string;  // price
  sz: string;  // size
  n: number;   // number of orders
}
```

### Rate Limits
- Info endpoint: No auth required, generous limits
- Exchange endpoint: Per-address rate limiting
- WebSocket: Handle disconnects gracefully; snapshot on reconnect

---

## 3. dYdX v4 Architecture

### Overview

dYdX v4 ("dYdX Chain") is a sovereign L1 blockchain built on Cosmos SDK + CometBFT, purpose-built for perpetual futures trading. It features a fully decentralized, off-chain orderbook with on-chain settlement.

### System Architecture

```
┌────────────────────────────────────────────────┐
│                 Front Ends                      │
│    (Web App / iOS / Android — all open source)  │
├─────────────┬──────────────────────────────────┤
│             │                                   │
│  ┌──────────▼───────────┐  ┌─────────────────┐ │
│  │       Indexer         │  │   Validators    │ │
│  │  (Postgres/Redis/    │  │  (60+ nodes)    │ │
│  │   Kafka pipeline)    │◄─┤                 │ │
│  │  - REST API          │  │  ┌───────────┐  │ │
│  │  - WebSocket API     │  │  │ In-Memory │  │ │
│  └──────────────────────┘  │  │ Order Book│  │ │
│                            │  └─────┬─────┘  │ │
│                            │        │        │ │
│                            │  ┌─────▼─────┐  │ │
│                            │  │ Matching  │  │ │
│                            │  │ Engine    │  │ │
│                            │  └─────┬─────┘  │ │
│                            │        │        │ │
│                            │  ┌─────▼─────┐  │ │
│                            │  │ CometBFT  │  │ │
│                            │  │ Consensus │  │ │
│                            │  └───────────┘  │ │
│                            └─────────────────┘ │
│                                                 │
│              Full Nodes                         │
│  (Non-voting, stream data to Indexer)           │
└────────────────────────────────────────────────┘
```

### CLOB Matching Engine

- **Off-chain orderbook**: Orders are stored in-memory on each validator (NOT committed to chain state)
- **Gossip protocol**: Orders are gossiped between validators via CometBFT P2P
- **Proposer matches**: The block proposer runs the matching engine and includes matched trades in the block
- **Consensus on fills**: Only matched trades (not the full order book) go through consensus
- **Weighted round-robin**: Validators take turns proposing blocks based on stake weight

#### Order Flow
1. User submits order → reaches a validator
2. Validator gossips order to all other validators
3. All validators update their local in-memory order books
4. Block proposer matches crossing orders
5. Matched trades included in proposed block
6. ⅔+ validator stake votes to confirm → block committed
7. On-chain state updated (positions, balances, PnL)
8. Indexer streams updates to frontends

### Liquidation System

- **Liquidation daemon**: Runs alongside each validator
- Monitors all positions' margin ratios against maintenance margin
- When position is undercollateralized, submits liquidation order
- Liquidation orders are special — they bypass normal order submission
- Insurance fund backstops negative PnL from liquidations
- Deleveraging: If insurance fund depleted, profitable positions are auto-deleveraged

### Key dYdX v4 Features

- **Governance**: DYDX token holders govern the chain (markets, parameters, upgrades)
- **Fee distribution**: Trading fees go to validators/stakers
- **100+ markets**: Permissionless market creation via governance
- **Cross-margin and isolated margin** support
- **Subaccounts**: Each address can have 128 subaccounts with isolated risk

### Indexer Architecture

- **Full node** → streams block data → **Kafka** → **Indexer services**
- **Postgres**: Stores on-chain data (positions, fills, funding)
- **Redis**: Caches off-chain data (order book state)
- **REST + WebSocket API**: Serves data to frontends
- Decoupled from validators for performance isolation

### Key Metrics
- ~$1B+ daily volume
- 60+ validators
- ~1-2s block times
- 0.05% taker / 0.02% maker fees (tiered)

---

## 4. GMX v2 Architecture

### Overview

GMX v2 (gmx-synthetics) is a decentralized perpetual exchange on Arbitrum and Avalanche. Unlike Hyperliquid and dYdX, GMX uses **oracle-based pricing** (no order book). Traders trade against pooled liquidity (GM pools) at oracle prices with price impact.

### Core Design

```
┌───────────────────────────────────────────┐
│              GMX v2 System                 │
├───────────────────────────────────────────┤
│  ┌─────────┐   ┌──────────┐   ┌────────┐ │
│  │  Users   │──▶│  Router  │──▶│Exchange│ │
│  │(Traders/ │   │(Approve  │   │Router  │ │
│  │ LPs)     │   │ tokens)  │   │(Create │ │
│  └─────────┘   └──────────┘   │requests)│ │
│                                └───┬────┘ │
│                                    │      │
│  ┌─────────────────────────────────▼────┐ │
│  │           Request Queue              │ │
│  │  (Deposits, Withdrawals, Orders)     │ │
│  └──────────────────┬──────────────────┘ │
│                     │                    │
│  ┌──────────────────▼──────────────────┐ │
│  │     Keeper Network (Off-chain)      │ │
│  │  - Pull prices from Archive Nodes   │ │
│  │  - Bundle prices + execute request  │ │
│  └──────────────────┬──────────────────┘ │
│                     │                    │
│  ┌──────────────────▼──────────────────┐ │
│  │         Execution Contracts         │ │
│  │  - DepositHandler                   │ │
│  │  - WithdrawalHandler                │ │
│  │  - OrderHandler                     │ │
│  │  - LiquidationHandler               │ │
│  └──────────────────┬──────────────────┘ │
│                     │                    │
│  ┌──────────────────▼──────────────────┐ │
│  │          GM Market Pools            │ │
│  │  - Long token (e.g., WETH)          │ │
│  │  - Short token (e.g., USDC)         │ │
│  │  - Index token (e.g., ETH)          │ │
│  └─────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

### Two-Step Execution Model

All actions in GMX v2 follow a two-step (request → execute) pattern to prevent front-running:

1. **User creates request** (deposit, withdraw, order) — funds are locked
2. **Keeper executes request** with signed oracle prices from after the request timestamp
3. If not executed within timeout, request can be cancelled

### GM Pools (Liquidity)

- Each market has its own **GM pool** with a long token + short token
- Example: ETH/USD market → WETH (long) + USDC (short)
- LPs deposit tokens → receive GM tokens (market tokens)
- GM token price = `(pool value) / (GM total supply)`
- Pool value includes: token deposits + pending PnL + pending borrow fees
- **Risk isolation**: Each market's LPs are only exposed to that market

#### GLV (GMX Liquidity Vault)
- Wrapper over multiple GM pools with same long/short tokens
- Auto-rebalances between markets based on utilization
- Simplifies LP experience — deposit once, get diversified exposure

### Oracle System

- **Off-chain oracle keepers**: Pull prices from reference exchanges, sign them
- **Archive nodes**: Store signed prices for retrieval
- **Min/max prices**: Both signed to capture bid-ask spread
- Prices stored with 30 decimals of precision
- Used for all execution — no order book needed

### Fee Structure

- **Funding fees**: Larger side (longs vs shorts) pays smaller side
- **Borrowing fees**: Prevents users from opening offsetting positions
- **Price impact**: Simulates AMM-like slippage
  - Negative impact if action worsens balance
  - Positive impact if action improves balance
- **Swap fees**: For token exchanges within pools

### Liquidations

- Positions liquidated when collateral falls below maintenance margin
- Keepers submit liquidation transactions with oracle prices
- Liquidation fee goes to keeper as incentive
- Remaining collateral (if any) returned to user

### Key Metrics
- ~$500M–1B daily volume
- Deployed on Arbitrum + Avalanche
- ~$500M+ TVL across GM pools
- 0.05%–0.07% base trading fees

---

## 5. Comparison Table

| Feature | Hyperliquid | dYdX v4 | GMX v2 | **GoodPerps (Proposed)** |
|---|---|---|---|---|
| **Architecture** | Custom L1 (HyperBFT) | Cosmos SDK L1 | Smart contracts (Arbitrum) | GoodDollar L2 + off-chain engine |
| **Matching** | On-chain CLOB | Off-chain CLOB, on-chain settlement | Oracle-based (no order book) | Off-chain CLOB + external routing |
| **Throughput** | 200K orders/sec | ~500 orders/block | Limited by Arbitrum block space | Limited by L2 + engine capacity |
| **Finality** | Sub-second | 1-2 seconds | ~0.3s (Arbitrum) | ~2-5s (L2 dependent) |
| **Liquidity Source** | Native order book + HLP vault | Native order book | LP pools (GM tokens) | External (Hyperliquid) + native |
| **Oracle** | Internal mark price | Internal + external | Off-chain signed prices | Pyth + Chainlink + Hyperliquid |
| **Margin** | Cross + isolated | Cross + isolated + subaccounts | Per-position | Cross + isolated |
| **Fee Model** | 0.02% taker / rebate maker | Tiered, 0.05% taker | 0.05-0.07% + price impact | 0.05% taker, 33% → UBI |
| **Decentralization** | Validator set (growing) | 60+ validators | Fully on-chain (Arbitrum) | Hybrid (off-chain book, on-chain settle) |
| **Composability** | HyperEVM | Cosmos IBC | Full EVM (Arbitrum) | GoodDollar L2 EVM |
| **Cold Start** | Hard (need own liquidity) | Hard (need own liquidity) | Easier (LP pools) | Easy (route to Hyperliquid) |

### Pros/Cons for GoodPerps

#### Hyperliquid Model (On-chain CLOB)
- ✅ Highest performance, best UX
- ✅ Rich API we can pull prices/liquidity from
- ❌ Requires custom L1 or very high-perf L2
- ❌ All orders must be processed by chain
- **Verdict**: Use as external liquidity source + price oracle

#### dYdX v4 Model (Off-chain CLOB + On-chain Settlement)
- ✅ Best balance of decentralization + performance
- ✅ Proven architecture for perps at scale
- ✅ Off-chain matching avoids gas costs for orders
- ❌ Requires running validator infrastructure
- ❌ Complex Cosmos SDK stack
- **Verdict**: Best architectural inspiration for GoodPerps

#### GMX v2 Model (Oracle-based, No Order Book)
- ✅ Simplest to implement (just contracts + keepers)
- ✅ No cold start problem (LP pools provide liquidity)
- ✅ Fully on-chain, composable
- ❌ Oracle dependency = manipulation risk
- ❌ Price impact model less capital-efficient than CLOB
- ❌ Slower execution (two-step)
- **Verdict**: Fallback design if CLOB too complex; good for long-tail assets

### Recommended Approach: Hybrid

**Use dYdX-style architecture (off-chain CLOB + on-chain settlement) with Hyperliquid as external liquidity/oracle source.**

---

## 6. GoodPerps Backend Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Web/Mobile)              │
│               WebSocket + REST API                   │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│              GoodPerps Backend Service               │
│                                                      │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────┐ │
│  │  Order Book   │  │   Matching    │  │  Risk     │ │
│  │  Engine       │  │   Engine      │  │  Engine   │ │
│  │  (In-memory)  │  │  (Price-time) │  │  (Margin) │ │
│  └──────┬───────┘  └───────┬───────┘  └─────┬─────┘ │
│         │                  │                │       │
│  ┌──────▼──────────────────▼────────────────▼─────┐ │
│  │              Trade Settlement Layer             │ │
│  │  - Batch matched trades                         │ │
│  │  - Submit to GoodDollar L2                      │ │
│  │  - Update margin/PnL on-chain                   │ │
│  └─────────────────────┬──────────────────────────┘ │
│                        │                            │
│  ┌─────────────────────▼──────────────────────────┐ │
│  │           External Routing Layer                │ │
│  │  - Route to Hyperliquid for deep liquidity      │ │
│  │  - Aggregate external + internal book           │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Oracle Feed  │  │  Keeper Bot  │  │  Fee Router │ │
│  │ (Pyth/HL)   │  │ (Liquidation │  │ (33% → UBI) │ │
│  │              │  │  + Funding)  │  │              │ │
│  └─────────────┘  └──────────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│              GoodDollar L2 (On-chain)                │
│                                                      │
│  ┌─────────────────┐  ┌────────────────────────────┐ │
│  │ GoodPerps.sol   │  │  UBIFeeSplitter.sol        │ │
│  │ - Positions     │  │  - 33% trading fees → UBI  │ │
│  │ - Margin        │  │  - 33% → treasury          │ │
│  │ - Settlements   │  │  - 33% → LPs/stakers       │ │
│  └─────────────────┘  └────────────────────────────┘ │
│                                                      │
│  ┌─────────────────┐  ┌────────────────────────────┐ │
│  │ MarginVault.sol │  │  InsuranceFund.sol         │ │
│  │ - USDC custody  │  │  - Backstop for            │ │
│  │ - Withdrawals   │  │    liquidation losses       │ │
│  └─────────────────┘  └────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Off-Chain Order Book with On-Chain Settlement

#### Why Hybrid?
- **Gas costs**: Placing/canceling orders on-chain is too expensive for active traders
- **Latency**: On-chain matching adds block-time latency
- **Flexibility**: Off-chain engine can route to external venues
- **Settlement security**: Final state changes (margin, PnL) are on-chain and verifiable

#### Flow
1. User deposits margin into `MarginVault.sol` on L2
2. User connects to GoodPerps backend via WebSocket
3. Orders are submitted off-chain to the matching engine
4. Engine matches orders (internal book + Hyperliquid routing)
5. Matched trades batched and submitted to `GoodPerps.sol` for settlement
6. On-chain contract updates positions, computes PnL, collects fees
7. Fees split: 33% UBI, 33% treasury, 33% LPs/stakers

### External Price Oracle

```typescript
// Price feed hierarchy (most preferred first):
// 1. Pyth Network — sub-second, 350+ price feeds
// 2. Hyperliquid mid prices — real-time via WebSocket
// 3. Chainlink — on-chain fallback, slower but battle-tested

// Mark price = median(Pyth, Hyperliquid, Chainlink)
// Index price = Pyth (primary) with Chainlink (fallback)
// Funding rate = (mark - index) / index * (1/24)
```

### External Liquidity Routing

For markets where internal liquidity is thin, route orders to Hyperliquid:

1. User places order on GoodPerps
2. Engine checks internal book — if fill possible, match internally
3. If insufficient internal liquidity, route remainder to Hyperliquid via API
4. Hyperliquid fill is mirrored back to user's GoodPerps position
5. GoodPerps holds hedging position on Hyperliquid (via protocol-owned account)

```
User Order (Buy 1 BTC @ market)
     │
     ├─► Internal Book: 0.3 BTC available @ $65,000
     │   → Fill 0.3 BTC internally
     │
     └─► Hyperliquid Router: Route 0.7 BTC remaining
         → Place market buy on Hyperliquid
         → Get fill at $65,002
         → Mirror fill to user at $65,002 + spread
```

### Fee Routing

```solidity
// UBIFeeSplitter.sol
contract UBIFeeSplitter {
    uint256 public constant UBI_SHARE = 3333;      // 33.33%
    uint256 public constant TREASURY_SHARE = 3333;  // 33.33%
    uint256 public constant LP_SHARE = 3334;        // 33.34%
    uint256 public constant DENOMINATOR = 10000;

    address public ubiContract;
    address public treasury;
    address public lpRewards;

    function splitFees(uint256 totalFees) external {
        uint256 ubiAmount = (totalFees * UBI_SHARE) / DENOMINATOR;
        uint256 treasuryAmount = (totalFees * TREASURY_SHARE) / DENOMINATOR;
        uint256 lpAmount = totalFees - ubiAmount - treasuryAmount;

        IERC20(usdc).transfer(ubiContract, ubiAmount);
        IERC20(usdc).transfer(treasury, treasuryAmount);
        IERC20(usdc).transfer(lpRewards, lpAmount);
    }
}
```

### Margin System

#### Isolated Margin
- Each position has its own margin allocation
- Liquidation of one position doesn't affect others
- Max loss = allocated margin for that position
- Simpler risk management for users

#### Cross Margin
- All positions share a single margin pool
- Unrealized PnL from one position can support another
- More capital-efficient
- Entire account can be liquidated if total margin insufficient

#### Margin Calculation
```
Initial Margin = Position Size × Entry Price / Leverage
Maintenance Margin = Position Size × Mark Price × MMR (e.g., 0.5%)

Account Value = Margin Balance + Unrealized PnL
Margin Ratio = Maintenance Margin / Account Value

Liquidation when: Margin Ratio > 1.0
```

### Liquidation Engine

```
┌─────────────────────────────────────────┐
│           Keeper Bot (Liquidator)        │
│                                         │
│  Every block / 1-second interval:       │
│  1. Fetch all open positions            │
│  2. Get current mark prices             │
│  3. Calculate margin ratio per account  │
│  4. If margin_ratio > 1.0:             │
│     a. Submit liquidation tx to L2      │
│     b. Position closed at mark price    │
│     c. Liquidation fee to keeper        │
│     d. Remaining margin to user         │
│     e. If negative: insurance fund pays │
│  5. Update funding rates hourly         │
└─────────────────────────────────────────┘
```

---

## 7. Implementation Plan

### Phase 1: Core Backend (Weeks 1-4)

#### 1.1 Order Book Engine (TypeScript)
- In-memory CLOB with price-time priority
- Support: limit, market, stop-loss, take-profit orders
- Efficient data structures (sorted maps / red-black trees)
- Thread-safe (or single-threaded event loop in Node.js)

#### 1.2 Matching Engine
- Price-time priority matching
- Partial fills support
- Self-trade prevention
- Batch trade output for on-chain settlement

#### 1.3 WebSocket Server
- Real-time order book updates (L2 snapshots + incremental)
- Trade stream
- User order updates
- Candle/chart data
- Authentication via signed messages

### Phase 2: Oracle + Price Feeds (Weeks 3-5)

#### 2.1 Hyperliquid Price Feed
- WebSocket connection to `wss://api.hyperliquid.xyz/ws`
- Subscribe to `allMids`, `l2Book`, `trades` for relevant pairs
- Maintain local order book mirror for routing decisions

#### 2.2 Pyth Network Integration
- Connect to Pyth price service (Hermes)
- Subscribe to relevant price feed IDs
- Use for mark price and funding rate calculation
- On-chain: Pyth Solana → bridge to L2, or use Pyth EVM on L2

#### 2.3 Chainlink Integration
- On-chain price feeds as fallback
- Read from Chainlink aggregators on L2
- Used when Pyth unavailable or for verification

#### 2.4 Mark Price Oracle
```
mark_price = median(pyth_price, hyperliquid_mid, chainlink_price)
// If only 2 sources available, use average
// If only 1 source, use it with staleness check (max 60s)
```

### Phase 3: Smart Contracts (Weeks 4-7)

#### 3.1 GoodPerps.sol
- Position management (open, close, modify)
- Margin accounting
- Settlement of matched trades (called by backend)
- PnL calculation and distribution
- Access control: only authorized settlement operators

#### 3.2 MarginVault.sol
- USDC deposits and withdrawals
- Withdrawal delays for security
- Balance tracking per user

#### 3.3 UBIFeeSplitter.sol
- Receive trading fees
- Split 33/33/34 to UBI, treasury, LPs
- Configurable by governance

#### 3.4 InsuranceFund.sol
- Absorb negative PnL from liquidations
- Funded by portion of liquidation fees
- Governance-controlled parameters

### Phase 4: External Routing (Weeks 6-8)

#### 4.1 Hyperliquid Router
- Maintain Hyperliquid account with deposited USDC
- Route orders when internal liquidity insufficient
- Track positions on both GoodPerps and Hyperliquid
- Hedge management: keep delta-neutral across venues

#### 4.2 Smart Order Routing
```
For each incoming order:
1. Check internal book — what can be filled?
2. Check Hyperliquid book (via cached L2 data)
3. Route to minimize slippage:
   - If internal fill is better → fill internally
   - If Hyperliquid is better → route externally
   - If split improves average → split across venues
4. Apply GoodPerps fee on all fills
```

### Phase 5: Keeper Infrastructure (Weeks 7-9)

#### 5.1 Liquidation Keeper
- Poll positions every second
- Calculate margin ratios using latest mark prices
- Submit liquidation transactions for underwater accounts
- Handle partial liquidations (deleverage to safe ratio)

#### 5.2 Funding Rate Keeper
- Calculate funding rate every hour
- Based on `(mark - index) / index`
- Capped at ±0.1% per hour
- Submit funding rate update to contract
- Apply payments to all open positions

#### 5.3 Settlement Keeper
- Batch matched trades from engine
- Submit settlement transactions to L2 every N seconds
- Handle reorgs and failed transactions
- Maintain nonce management for reliable submission

### Phase 6: Testing & Launch (Weeks 8-12)

#### 6.1 Testnet Deployment
- Deploy contracts to GoodDollar L2 testnet
- Run backend against testnet
- Paper trading mode for users

#### 6.2 Security
- Smart contract audit
- Backend penetration testing
- Oracle manipulation testing
- Liquidation cascade simulation

#### 6.3 Mainnet Launch
- Limited markets (BTC, ETH)
- Position size caps
- Gradual increase as system proves stable

### Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| Order Book Engine | TypeScript (Node.js) | Fast iteration, team familiarity |
| WebSocket Server | ws + Express | Battle-tested, low overhead |
| Price Feeds | WebSocket clients | Real-time, low latency |
| Smart Contracts | Solidity | EVM-compatible L2 |
| Database | PostgreSQL + Redis | Positions in PG, order book in Redis |
| Keeper Bots | TypeScript | Same stack, share types |
| Monitoring | Prometheus + Grafana | Industry standard |
| Queue | Redis Streams or Bull | Trade settlement queue |

---

## 8. Backend Code Reference

Initial backend code is located at:
```
/home/goodclaw/gooddollar-l2/backend/perps/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Entry point
│   ├── orderbook/
│   │   ├── OrderBook.ts            # CLOB implementation
│   │   ├── MatchingEngine.ts       # Price-time priority matching
│   │   └── types.ts                # Order/Trade types
│   ├── feeds/
│   │   ├── HyperliquidFeed.ts      # Hyperliquid WebSocket price feed
│   │   ├── PythFeed.ts             # Pyth Network integration
│   │   └── OracleAggregator.ts     # Multi-source oracle
│   ├── ws/
│   │   └── WebSocketServer.ts      # Client-facing WebSocket API
│   ├── contracts/
│   │   └── ContractInteraction.ts  # L2 contract calls
│   └── keeper/
│       ├── LiquidationKeeper.ts    # Liquidation bot
│       └── FundingKeeper.ts        # Funding rate bot
```

See the source files for full implementation details.

---

## Appendix A: Hyperliquid API Quick Reference

### Info Endpoint Cheat Sheet
```bash
# All mid prices
curl -sX POST https://api.hyperliquid.xyz/info -H "Content-Type: application/json" -d '{"type":"allMids"}'

# L2 order book for BTC
curl -sX POST https://api.hyperliquid.xyz/info -H "Content-Type: application/json" -d '{"type":"l2Book","coin":"BTC"}'

# Asset metadata
curl -sX POST https://api.hyperliquid.xyz/info -H "Content-Type: application/json" -d '{"type":"meta"}'

# Meta + live context
curl -sX POST https://api.hyperliquid.xyz/info -H "Content-Type: application/json" -d '{"type":"metaAndAssetCtxs"}'

# User state
curl -sX POST https://api.hyperliquid.xyz/info -H "Content-Type: application/json" -d '{"type":"clearinghouseState","user":"0x..."}'

# Candles
curl -sX POST https://api.hyperliquid.xyz/info -H "Content-Type: application/json" -d '{"type":"candleSnapshot","req":{"coin":"BTC","interval":"1h","startTime":1700000000000,"endTime":1700100000000}}'
```

### WebSocket Quick Connect
```javascript
const ws = new WebSocket('wss://api.hyperliquid.xyz/ws');
ws.on('open', () => {
  // Subscribe to BTC trades
  ws.send(JSON.stringify({method: 'subscribe', subscription: {type: 'trades', coin: 'BTC'}}));
  // Subscribe to all mid prices
  ws.send(JSON.stringify({method: 'subscribe', subscription: {type: 'allMids'}}));
  // Subscribe to BTC order book
  ws.send(JSON.stringify({method: 'subscribe', subscription: {type: 'l2Book', coin: 'BTC'}}));
});
```

---

## Appendix B: Key Design Decisions

### Why Not Pure On-Chain (like Hyperliquid)?
- GoodDollar L2 is not optimized for 200K orders/sec
- Would require rebuilding the entire L1 stack
- On-chain order book means every cancel costs gas

### Why Not Pure Oracle-Based (like GMX)?
- Less capital-efficient — LP pools need large TVL
- Price impact model is complex and less transparent
- No real price discovery — reliant on external oracles only

### Why Hybrid (like dYdX)?
- Best of both: off-chain speed + on-chain security
- Can start with external liquidity (Hyperliquid) and build internal over time
- Settlement on GoodDollar L2 means fees flow to UBI
- Flexible — can add more external venues later

### Why Route to Hyperliquid?
- Deepest liquidity for crypto perpetuals
- Rich API (REST + WebSocket)
- No KYC for API access
- Sub-second execution
- Can be done programmatically with EIP-712 signatures
