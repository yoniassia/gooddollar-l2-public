# GoodPredict — Prediction Markets Research & Backend Design

> Comprehensive research on Polymarket, Gnosis Conditional Tokens, UMA Optimistic Oracle, and the GoodPredict backend architecture for GoodDollar L2.

**Date:** 2026-04-03
**Status:** Initial Research & MVP Design

---

## Table of Contents

1. [Polymarket Architecture](#1-polymarket-architecture)
2. [Polymarket API](#2-polymarket-api)
3. [Gnosis Conditional Tokens](#3-gnosis-conditional-tokens)
4. [UMA Optimistic Oracle](#4-uma-optimistic-oracle)
5. [Market Making: AMM vs CLOB](#5-market-making-amm-vs-clob)
6. [GoodPredict Backend Design](#6-goodpredict-backend-design)
7. [Implementation Plan](#7-implementation-plan)
8. [Appendix: Contract Addresses & References](#8-appendix)

---

## 1. Polymarket Architecture

### 1.1 Overview

Polymarket is the world's largest prediction market, running on Polygon. It uses a **hybrid-decentralized** architecture:

- **Offchain**: Central Limit Order Book (CLOB) for order matching — fast, gas-free order placement and matching
- **Onchain**: Settlement via smart contracts on Polygon — atomic, trustless execution via CTF Exchange contracts

This hybrid approach gives the speed of a centralized exchange with the security guarantees of blockchain settlement.

### 1.2 CLOB Design

The CLOB (Central Limit Order Book) is Polymarket's core trading engine:

- **Order Types**:
  - **GTC** (Good Till Cancelled) — rests on book until filled or cancelled
  - **GTD** (Good Till Date) — auto-expires at specified timestamp
  - **FOK** (Fill Or Kill) — must fill entirely or cancel immediately
  - **FAK** (Fill And Kill) — fill what's available, cancel the rest
  - **Post-Only** — guaranteed maker; rejected if it would cross the spread

- **Order Lifecycle**:
  1. **Create & Sign**: Client creates EIP-712 signed order message containing tokenID, side, price, size, expiration, nonce
  2. **Submit to CLOB**: Signed order sent to operator; validated for signature, balance, allowance, tick size
  3. **Match or Rest**: Marketable orders match immediately; others rest on book
  4. **Settlement**: Operator submits matched trade on-chain; Exchange contract verifies signatures, transfers tokens atomically
  5. **Confirmation**: Trade achieves finality on Polygon

- **Tick Sizes**: Markets have configurable tick sizes (e.g., $0.01, $0.001) that constrain valid prices
- **Price Improvement**: Taker always gets the better price (buy at $0.55, match against resting sell at $0.52 → pay $0.52)
- **Maker/Taker**: Makers add liquidity (resting orders), takers remove it (crossing orders)

### 1.3 Conditional Tokens (CTF)

Polymarket uses Gnosis **Conditional Token Framework (CTF)** for outcome tokens:

- Each market has exactly 2 outcome tokens: **YES** and **NO** (ERC-1155)
- Every YES/NO pair is backed by exactly **$1 USDC.e** collateral locked in the CTF contract
- Token identifiers:
  - **Condition ID**: `keccak256(oracle, questionId, outcomeSlotCount)` — unique per market condition
  - **Question ID**: Hash of the market question used for resolution
  - **Token IDs**: ERC-1155 token IDs for trading on CLOB — one for YES, one for NO

### 1.4 Settlement

Settlement is handled by the **CTF Exchange** smart contract on Polygon:

- **Atomic execution**: Either the entire trade succeeds or nothing happens
- **Non-custodial**: Users always maintain custody; Exchange only executes with valid EIP-712 signatures
- **Split**: $1 USDC.e → 1 YES + 1 NO token
- **Merge**: 1 YES + 1 NO → $1 USDC.e
- **Redeem**: After resolution, winning tokens → $1 USDC.e each; losing tokens → $0

### 1.5 Neg-Risk Markets

Multi-outcome events (e.g., "Who will win the election?") use **negative risk** markets:
- Each outcome is a separate binary market
- A "neg-risk exchange" adapter ensures the sum of all outcome prices ≤ $1
- Users can't lose more than $1 across all outcomes of the same event

---

## 2. Polymarket API

### 2.1 API Architecture

Polymarket is served by **three separate APIs**:

| API | Base URL | Purpose | Auth |
|-----|----------|---------|------|
| **Gamma API** | `https://gamma-api.polymarket.com` | Markets, events, tags, search, profiles | Public (no auth) |
| **Data API** | `https://data-api.polymarket.com` | Positions, trades, leaderboards, open interest | Public (no auth) |
| **CLOB API** | `https://clob.polymarket.com` | Orderbook, pricing, order placement/cancellation | Public reads; Authenticated writes |

Plus a **Bridge API** (`https://bridge.polymarket.com`) for deposits/withdrawals (proxy to fun.xyz).

### 2.2 Key REST Endpoints

#### Gamma API (Market Discovery)
```
GET /events                          # List events
GET /events?slug={slug}             # Event by slug
GET /markets                        # List markets
GET /markets?id={id}               # Market by ID
GET /events?tag={tag}              # Filter by tag
```

#### CLOB API (Trading)
```
# Public (no auth)
GET /book?token_id={tokenID}       # Order book for a token
GET /midpoint?token_id={tokenID}   # Midpoint price
GET /spread?token_id={tokenID}     # Bid-ask spread
GET /price?token_id={tokenID}&side={BUY|SELL}  # Best price
GET /prices-history?market={conditionID}&interval={1m|1h|1d}&fidelity={N}  # OHLC data

# Authenticated
POST /order                         # Place order
DELETE /order/{orderID}            # Cancel order
GET /orders                        # List open orders
GET /trades                        # Trade history
POST /api-key                      # Create/derive API key
```

#### Data API (Analytics)
```
GET /positions?user={address}       # User positions
GET /trades?user={address}         # User trades
GET /activity?user={address}       # User activity
GET /leaderboard                   # Trading leaderboard
```

### 2.3 WebSocket Streams

Polymarket provides real-time WebSocket feeds at `wss://ws-subscriptions-clob.polymarket.com/ws/`:

- **Market channel**: Subscribe to `market:{tokenID}` for orderbook updates
- **User channel**: Subscribe to `user:{address}` for personal order/trade updates
- Message types: order book snapshots, incremental updates, trade executions, order status changes

### 2.4 Authentication

CLOB trading endpoints use **API Key + HMAC Signature**:
1. Derive API key from wallet signature: `POST /api-key` with EIP-712 signed message
2. Each authenticated request includes: API key, timestamp, signature (HMAC-SHA256 of request body + timestamp)
3. Orders themselves are EIP-712 signed by the user's private key

### 2.5 SDKs

Official SDKs available:
- **TypeScript**: `@polymarket/clob-client` (npm)
- **Python**: `py-clob-client` (pip)
- **Rust**: `polymarket-client-sdk` (crates.io)

---

## 3. Gnosis Conditional Tokens

### 3.1 Overview

The **Conditional Tokens Framework (CTF)** by Gnosis is the ERC-1155-based system for creating and managing outcome tokens. It's the settlement layer used by Polymarket and will be used by GoodPredict.

**Key insight**: CTF is a general-purpose framework for conditional outcomes. Any question with defined outcomes can be tokenized.

### 3.2 Core Concepts

#### Condition
A condition represents a question with multiple possible outcomes:
- **conditionId** = `keccak256(oracle, questionId, outcomeSlotCount)`
- **oracle**: Address authorized to report the result
- **questionId**: Arbitrary bytes32 identifier for the question
- **outcomeSlotCount**: Number of possible outcomes (2 for binary YES/NO)

#### Outcome Tokens (ERC-1155)
Each outcome is an ERC-1155 token. For binary markets:
- **Index set `0b01` (1)** = first outcome (YES)
- **Index set `0b10` (2)** = second outcome (NO)

Position IDs are derived from:
```
collectionId = keccak256(parentCollectionId, conditionId, indexSet)
positionId = keccak256(collateralToken, collectionId)
```

### 3.3 Key Functions

#### `prepareCondition(oracle, questionId, outcomeSlotCount)`
- Initializes a new condition with empty payout vector
- Must be called before any token operations
- Emits `ConditionPreparation` event

#### `splitPosition(collateralToken, parentCollectionId, conditionId, partition, amount)`
- Converts collateral into outcome tokens
- For a complete partition (e.g., [YES, NO] covering all outcomes): transfers `amount` collateral from user, mints `amount` of each outcome token
- For a partial partition: burns parent position tokens, mints child positions
- **Key invariant**: Total collateral always equals total supply of any complete set

```
Example: Split $100 G$ into binary market
$100 G$ → 100 YES tokens + 100 NO tokens
```

#### `mergePositions(collateralToken, parentCollectionId, conditionId, partition, amount)`
- Inverse of split — burns outcome tokens, returns collateral
- Requires equal amounts of all outcome tokens in the partition

```
Example: Merge tokens back
100 YES tokens + 100 NO tokens → $100 G$
```

#### `reportPayouts(questionId, payouts)`
- Called by the **oracle** (only `msg.sender` matching the condition's oracle)
- Sets the payout vector: e.g., `[1, 0]` for YES wins, `[0, 1]` for NO wins
- Can also do fractional: `[1, 1]` for 50/50 void

#### `redeemPositions(collateralToken, parentCollectionId, conditionId, indexSets)`
- Called by users after resolution
- Burns winning tokens, returns pro-rata share of collateral
- Payout = `balance × payoutNumerator / payoutDenominator`

### 3.4 Our ConditionalTokens.sol

We already have a **simplified ConditionalTokens** deployed at `/src/predict/ConditionalTokens.sol`:
- Custom minimal ERC-1155 (no OpenZeppelin dependency)
- Token IDs: `marketId * 2` (YES) and `marketId * 2 + 1` (NO)
- Only MarketFactory can mint/burn
- Standard ERC-1155 transfers supported

This is simpler than the full Gnosis CTF but sufficient for binary markets. The MarketFactory handles split/merge/redeem logic instead of the token contract itself.

---

## 4. UMA Optimistic Oracle

### 4.1 How It Works

UMA's **Optimistic Oracle (OO)** is a "human-powered oracle" that Polymarket uses for market resolution. The key insight: instead of requiring every answer to be verified, **assume the first answer is correct** unless someone disputes it.

### 4.2 Resolution Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. ASSERTION: Asserter posts bonded claim about outcome    │
│     - Posts bond (~$750 USDC.e on Polymarket)               │
│     - Specifies: identifier, timestamp, claim, currency     │
│                                                             │
│  2. CHALLENGE PERIOD: 2-hour window for disputes            │
│     ┌──────────────────────────┐                            │
│     │ No dispute → Accept      │ (Fast path: ~2 hours)     │
│     │ Disputed → Escalate      │                            │
│     └──────────────────────────┘                            │
│                                                             │
│  3. IF DISPUTED: New proposal round                         │
│     - Counter-bond posted by disputer                       │
│     - Second proposal → if also disputed → DVM vote         │
│                                                             │
│  4. DVM VOTE (rare): UMA token holders vote                 │
│     - 48-96 hour voting period                              │
│     - Aggregated vote determines outcome                    │
│     - Winner gets bond + half of loser's bond               │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Resolution Outcomes

| Outcome | Result | Bond Distribution |
|---------|--------|-------------------|
| **Proposer wins** | Original proposal accepted | Proposer gets bond back + half of disputer's bond |
| **Disputer wins** | Proposal rejected | Disputer gets bond back + half of proposer's bond |
| **Too Early** | Event hasn't concluded | Disputer wins |
| **Unknown/50-50** | Neither outcome applicable | Market resolves 50/50, each token redeems for $0.50 |

### 4.4 Key Properties

- **Escalation game**: Most resolutions are fast (2 hours, no dispute). Only contentious ones escalate.
- **Economic security**: Cost to corrupt > profit from corruption (would need 65%+ of UMA tokens)
- **Human judgment**: DVM uses human voters, not automated oracles — handles subjective questions
- **Polymarket adapter**: `UmaCtfAdapter` contract bridges UMA OO to the CTF's `reportPayouts()`

### 4.5 GoodPredict Resolution Strategy

For MVP, we'll use a **simplified resolution model**:
1. **Admin resolution** (Phase 1): Admin/resolver calls `resolve()` on MarketFactory
2. **Optimistic resolution** (Phase 2): Implement our own optimistic oracle pattern — anyone proposes, dispute period, admin arbitration
3. **UMA integration** (Phase 3): Full UMA OO integration for decentralized resolution

---

## 5. Market Making: AMM vs CLOB

### 5.1 AMM (Automated Market Maker)

Traditional prediction market approach (used by Augur v1, early Polymarket):

**How it works:**
- Liquidity pool holds both YES and NO tokens
- Constant-product formula: `YES × NO = k`
- Price adjusts automatically based on buying pressure
- Anyone can provide liquidity

**Pros:**
- Always liquid — there's always a price to trade at
- Simple to implement
- No order management needed

**Cons:**
- High slippage for large orders
- Impermanent loss for LPs
- Less capital efficient
- Wider spreads

### 5.2 CLOB (Central Limit Order Book)

Polymarket's current approach:

**How it works:**
- Bids (buy orders) and asks (sell orders) arranged by price
- Orders match when bid ≥ ask
- Market makers post orders on both sides

**Pros:**
- Tight spreads with active market makers
- No slippage for orders within book depth
- Better price discovery
- More capital efficient

**Cons:**
- Requires active market makers
- New markets may have no liquidity initially
- More complex infrastructure (matching engine, order management)

### 5.3 GoodPredict Approach: Hybrid

For GoodPredict, we'll use a **hybrid model**:

1. **Simple AMM for bootstrapping**: New markets start with a basic constant-product AMM to provide initial liquidity
2. **CLOB for active markets**: Once a market has enough interest, enable CLOB trading with better spreads
3. **Polymarket price feed**: For markets that also exist on Polymarket, pull external prices to inform our AMM/CLOB

**Why hybrid?**
- GoodDollar L2 will have lower initial liquidity than Polygon
- AMM ensures every market is tradeable from day one
- CLOB enables better prices as markets grow
- External price feeds prevent our markets from diverging wildly from global consensus

---

## 6. GoodPredict Backend Design

### 6.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     GoodPredict Backend                      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  REST API     │  │  WebSocket   │  │  Market Resolver │  │
│  │  (Express)    │  │  Server      │  │  Service         │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘  │
│         │                  │                  │              │
│  ┌──────▼──────────────────▼──────────────────▼──────────┐  │
│  │              CLOB Matching Engine                      │  │
│  │  ┌─────────┐  ┌─────────┐  ┌───────────────────┐    │  │
│  │  │ Order   │  │ Trade   │  │ Price Discovery   │    │  │
│  │  │ Books   │  │ Matcher │  │ (AMM + CLOB)      │    │  │
│  │  └─────────┘  └─────────┘  └───────────────────┘    │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │              External Integrations                     │  │
│  │  ┌─────────────────┐  ┌──────────────────────────┐   │  │
│  │  │ Polymarket Feed │  │ Blockchain (GoodDollar   │   │  │
│  │  │ (Price/Odds)    │  │ L2 contracts)            │   │  │
│  │  └─────────────────┘  └──────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Data Layer                                │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │  │
│  │  │ PostgreSQL│  │  Redis   │  │ Event Indexer    │   │  │
│  │  │ (Markets, │  │ (Cache,  │  │ (On-chain events)│   │  │
│  │  │  Orders)  │  │  PubSub) │  │                  │   │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 CLOB Matching Engine

The core of the backend — a TypeScript in-memory order book with price-time priority:

**Order Book Structure:**
```typescript
// Each market has two books: YES and NO
// Each book has bids (sorted highest-first) and asks (sorted lowest-first)
interface OrderBook {
  marketId: string;
  bids: SortedMap<Price, Order[]>;  // Buy orders: highest price first
  asks: SortedMap<Price, Order[]>;  // Sell orders: lowest price first
}
```

**Matching Rules:**
1. **Price-Time Priority**: Best price first, then earliest order at same price
2. **Tick Size**: All prices must be multiples of the market's tick size (e.g., $0.01)
3. **Complementary Matching**: A BUY YES at $0.60 can match with a BUY NO at $0.40 (since $0.60 + $0.40 = $1.00)
4. **Price Improvement**: Taker always gets the resting order's price

**Trade Settlement:**
- Matched trades are batched and submitted to the MarketFactory contract on GoodDollar L2
- On-chain settlement is atomic: either all fills in a batch succeed or all revert
- Backend tracks trade status: MATCHED → SUBMITTED → CONFIRMED | FAILED

### 6.3 External Odds/Liquidity from Polymarket

For markets that also exist on Polymarket, we pull external price data:

```typescript
// Poll Polymarket CLOB API for reference prices
GET https://clob.polymarket.com/midpoint?token_id={tokenID}
GET https://clob.polymarket.com/book?token_id={tokenID}

// Use as:
// 1. Reference price for our AMM's initial pricing
// 2. Price feed displayed on frontend alongside our price
// 3. Arbitrage signal — if our price diverges >5%, flag for market makers
```

**Integration design:**
- Background service polls Polymarket every 5 seconds for active linked markets
- Stores latest midpoint, spread, and book depth in Redis
- Frontend shows both "GoodPredict price" and "Polymarket price" for comparison
- No direct trading on Polymarket — just price reference

### 6.4 Market Creation Flow

```
User/Admin creates market
         │
         ▼
┌─────────────────────────┐
│ 1. Validate question,   │
│    end time, category   │
│    resolution source    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 2. Submit to MarketFactory│
│    on GoodDollar L2      │
│    → createMarket()      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 3. Initialize order books│
│    (empty CLOB + seed   │
│    AMM if desired)      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 4. Link to Polymarket   │
│    market (if exists)   │
│    for price reference  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 5. Market goes live     │
│    → WebSocket broadcast│
└─────────────────────────┘
```

**Phase 1 (MVP)**: Admin-only market creation
**Phase 2**: Community creation with admin approval queue
**Phase 3**: Permissionless creation with staking (creator stakes G$ to prevent spam)

### 6.5 Resolution System

**Phase 1 — Admin Resolution:**
```
Market end time reached
         │
         ▼
Trading paused (closeMarket())
         │
         ▼
Admin reviews outcome
         │
         ▼
Admin calls resolve(marketId, yesWon)
         │
         ▼
Winners can redeem tokens for G$
```

**Phase 2 — Optimistic Resolution (our own):**
```
Market end time reached
         │
         ▼
Anyone can propose outcome (bonds G$)
         │
         ▼
24-hour dispute period
         │
    ┌────┴──── No dispute ──────┐
    │                            │
    ▼                            ▼
Disputed → Admin arbitration   Accepted → Auto-resolve
    │
    ▼
Admin decides (proposer or disputer loses bond)
```

**Phase 3 — UMA Integration:**
- Deploy UmaCtfAdapter for GoodDollar L2
- Full decentralized resolution via UMA OO + DVM

### 6.6 Fee Routing

All fees go through the **UBIFeeSplitter**:

```
Trade/Redemption Fee (1% of payout)
         │
         ▼
UBIFeeSplitter.splitFee()
         │
    ┌────┴────────────────┐────────────────┐
    │                     │                 │
    ▼ 33%                 ▼ 33%             ▼ 33%
UBI Pool           Protocol Treasury   dApp Reward
(GoodDollar UBI)   (development fund)  (market creator)
```

This means **every prediction market trade funds UBI**. The more people trade, the more G$ flows to UBI claimers.

### 6.7 Conditional Token Mechanics (GoodPredict)

Our system uses a simplified version of the Gnosis CTF:

| Operation | Gnosis CTF | GoodPredict |
|-----------|-----------|-------------|
| **Create condition** | `prepareCondition()` | `createMarket()` on MarketFactory |
| **Split/Buy** | `splitPosition()` | `buy()` — deposits G$, mints YES or NO tokens |
| **Merge** | `mergePositions()` | Not yet (Phase 2: merge equal YES+NO → G$ refund) |
| **Resolve** | `reportPayouts()` | `resolve()` — admin sets winner |
| **Redeem** | `redeemPositions()` | `redeem()` — burn winning tokens, receive G$ minus fee |

Token ID scheme: `marketId * 2` = YES, `marketId * 2 + 1` = NO

---

## 7. Implementation Plan

### 7.1 Phase 1: MVP Backend (Weeks 1-3)

#### Week 1: Core Engine
- [ ] CLOB matching engine with price-time priority
- [ ] In-memory order books with Redis persistence
- [ ] Order types: GTC, FOK
- [ ] REST API for order placement, cancellation, market data
- [ ] WebSocket server for real-time updates

#### Week 2: Integration
- [ ] Polymarket price feed integration (5s polling)
- [ ] Market creation/management API
- [ ] On-chain event indexer for MarketFactory events
- [ ] Trade settlement queue (batch on-chain execution)

#### Week 3: Resolution & Testing
- [ ] Admin resolution endpoints
- [ ] Redemption flow (with fee routing to UBIFeeSplitter)
- [ ] Integration tests with local GoodDollar L2 fork
- [ ] Load testing (target: 100 orders/second)

### 7.2 Phase 2: Enhanced Features (Weeks 4-6)

- [ ] Community market creation with approval queue
- [ ] Optimistic resolution system (propose + dispute)
- [ ] Merge positions (YES + NO → G$ refund)
- [ ] Simple AMM for bootstrapping new markets
- [ ] Portfolio tracking API
- [ ] Historical price charts (OHLC candles)

### 7.3 Phase 3: Decentralization (Weeks 7-10)

- [ ] UMA Optimistic Oracle integration
- [ ] Permissionless market creation with staking
- [ ] Cross-market arbitrage detection
- [ ] Market maker incentive program
- [ ] Advanced order types (GTD, post-only)

### 7.4 Tech Stack

| Component | Technology |
|-----------|-----------|
| **Runtime** | Node.js 20+ / TypeScript |
| **API Framework** | Express.js |
| **WebSocket** | ws (native WebSocket) |
| **Database** | PostgreSQL (markets, orders, trades) |
| **Cache** | Redis (order books, price feeds, PubSub) |
| **Blockchain** | ethers.js v6 (GoodDollar L2 interaction) |
| **Testing** | Vitest |
| **Deployment** | Docker + PM2 on clawz.org |

---

## 8. Appendix

### 8.1 Polymarket Contract Addresses (Polygon)

| Contract | Address |
|----------|---------|
| CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` |
| Neg Risk CTF Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` |
| Conditional Tokens | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |
| UmaCtfAdapter v3.0 | `0x157Ce2d672854c848c9b79C49a8Cc6cc89176a49` |
| UmaCtfAdapter v2.0 | `0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74` |

### 8.2 GoodPredict Contract Addresses (GoodDollar L2)

| Contract | Path |
|----------|------|
| ConditionalTokens | `/src/predict/ConditionalTokens.sol` |
| MarketFactory | `/src/predict/MarketFactory.sol` |
| UBIFeeSplitter | `/src/UBIFeeSplitter.sol` |

### 8.3 Key References

- [Polymarket Documentation](https://docs.polymarket.com/)
- [Polymarket CLOB Client (TypeScript)](https://github.com/Polymarket/clob-client)
- [Gnosis Conditional Tokens](https://github.com/gnosis/conditional-tokens-contracts)
- [UMA Protocol](https://github.com/UMAprotocol/protocol)
- [UMA Oracle Documentation](https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work)
- [Polymarket UMA CTF Adapter](https://github.com/Polymarket/uma-ctf-adapter)

### 8.4 Price Discovery Example

```
Market: "Will BTC reach $150K by Dec 2026?"

On Polymarket: YES = $0.42, NO = $0.58

On GoodPredict (initial):
  - AMM seeds at $0.50/$0.50 (no info yet)
  - Polymarket feed shows $0.42/$0.58 reference
  - First trader buys YES at $0.40 (below Polymarket)
  - Arb opportunity: buy YES on GoodPredict at $0.40, mirrors Polymarket sentiment
  - Market converges toward global consensus

Over time:
  - Active traders bring GoodPredict prices in line with Polymarket
  - GoodPredict-only markets develop their own price discovery
  - All fees fund UBI regardless
```
