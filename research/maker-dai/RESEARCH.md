# GoodStable Research: MakerDAO, Liquity, crvUSD → gUSD Design

**Date:** 2026-04-03
**Author:** GoodClaw (AI Research Agent)
**Purpose:** Comprehensive research on stablecoin protocols to design GoodStable (gUSD) for GoodDollar L2

---

## Table of Contents

1. [MakerDAO Architecture](#1-makerdao-architecture)
2. [How DAI Works](#2-how-dai-works)
3. [Stability Fee](#3-stability-fee)
4. [Liquidation System](#4-liquidation-system)
5. [Peg Stability Module (PSM)](#5-peg-stability-module-psm)
6. [Governance](#6-governance)
7. [Liquity Comparison](#7-liquity-comparison)
8. [crvUSD Comparison](#8-crvusd-comparison)
9. [GoodStable Design Document](#9-goodstable-design-document)
10. [Initial Solidity Contracts](#10-initial-solidity-contracts)

---

## 1. MakerDAO Architecture

MakerDAO's Multi-Collateral Dai (MCD) system — codenamed **DSS** (Dai Stablecoin System) — is a modular set of smart contracts. Each contract has a single responsibility and communicates through well-defined interfaces.

### 1.1 Vat — The Core Accounting Engine

**Source:** `dss/src/vat.sol`

The Vat is the central contract that maintains the entire state of the system. It tracks:

- **Ilks** (collateral types): Each ilk has parameters:
  - `Art` — Total normalized debt across all vaults of this type [wad]
  - `rate` — Accumulated stability fee rate [ray] (grows over time via `fold`)
  - `spot` — Price with safety margin (price / liquidation ratio) [ray]
  - `line` — Per-ilk debt ceiling [rad]
  - `dust` — Minimum debt per vault [rad]

- **Urns** (vaults): Each urn has:
  - `ink` — Locked collateral amount [wad]
  - `art` — Normalized debt [wad] (actual debt = `art × rate`)

- **Global state:**
  - `debt` — Total DAI issued [rad]
  - `vice` — Total unbacked DAI (system bad debt) [rad]
  - `Line` — Global debt ceiling [rad]

**Key functions:**
| Function | Purpose |
|----------|---------|
| `frob(ilk, u, v, w, dink, dart)` | Core CDP manipulation — add/remove collateral (`dink`) and debt (`dart`). Enforces safety (collateral ratio ≥ minimum), debt ceilings, and dust limits. |
| `fork(ilk, src, dst, dink, dart)` | Split/merge vaults between addresses |
| `grab(ilk, u, v, w, dink, dart)` | Confiscate vault (used by liquidation system, authorized only) |
| `heal(rad)` | Cancel equal amounts of system debt and surplus |
| `suck(u, v, rad)` | Create unbacked DAI — add `sin` to address `u`, add `dai` to address `v` |
| `fold(ilk, u, rate)` | Update the rate accumulator — how stability fees accrue |
| `slip(ilk, usr, wad)` | Directly modify gem (collateral) balances (authorized only) |
| `flux(ilk, src, dst, wad)` | Transfer collateral between addresses within the system |
| `move(src, dst, rad)` | Transfer internal DAI between addresses |

**Key insight for GoodStable:** The Vat uses fixed-point arithmetic with three precision levels:
- `wad` = 10^18 (token amounts)
- `ray` = 10^27 (rates, ratios)
- `rad` = 10^45 (high-precision internal DAI)

The Vat has **no external dependencies** — it's purely internal accounting. External tokens enter/exit via Join adapters.

### 1.2 Jug — Stability Fee Collection

**Source:** `dss/src/jug.sol`

The Jug calculates and collects stability fees. It works by updating the `rate` accumulator in the Vat.

**Data per ilk:**
- `duty` — Per-second, per-ilk stability fee contribution [ray]
- `rho` — Timestamp of last fee collection

**Global:**
- `base` — Global per-second stability fee added to all ilks [ray]
- `vow` — Address of the Vow (debt engine) that receives fees

**Core function — `drip(ilk)`:**
```
rate_new = rpow(base + duty, now - rho) × rate_old
vat.fold(ilk, vow, rate_new - rate_old)
```

This compounds the stability fee over elapsed time and sends the accrued DAI to the Vow (surplus buffer). Anyone can call `drip()` — it's permissionless.

**Key insight for GoodStable:** The stability fee math uses `rpow` for compound interest calculation. The fee is expressed as a per-second ray value. E.g., 2% annual ≈ 1000000000627937192491029810 per second.

### 1.3 Spot — Price Oracle Module

**Source:** `dss/src/spot.sol`

The Spotter connects external price feeds to the Vat.

**Per ilk:**
- `pip` — Address of the price feed oracle
- `mat` — Liquidation ratio [ray] (e.g., 1.5 × 10^27 for 150%)

**Core function — `poke(ilk)`:**
```
(val, has) = pip.peek()           // Get price from oracle
spot = val × 10^9 / par / mat    // Apply liquidation ratio
vat.file(ilk, "spot", spot)      // Update Vat
```

The `par` parameter (reference per DAI, normally 1 RAY) allows target rate adjustments — DAI's version of a "target price."

**Key insight for GoodStable:** We can simplify this for GoodDollar L2 by using Chainlink or a GoodDollar oracle. The `mat` parameter directly sets our collateral ratio requirements.

### 1.4 Dog — Liquidation Trigger (v2.0)

**Source:** `dss/src/dog.sol`

The Dog replaced the original `Cat` contract. It determines when vaults are undercollateralized and initiates liquidation auctions.

**Per ilk:**
- `clip` — Address of the Clipper auction contract
- `chop` — Liquidation penalty [wad] (e.g., 1.13 × 10^18 = 13% penalty)
- `hole` — Per-ilk maximum DAI in active auctions [rad]
- `dirt` — Current DAI in active auctions per ilk [rad]

**Global:**
- `Hole` — Global maximum DAI across all active auctions
- `Dirt` — Current global DAI in active auctions

**Core function — `bark(ilk, urn, kpr)`:**
1. Check vault is unsafe: `ink × spot < art × rate`
2. Calculate how much to liquidate (respecting `Hole`/`hole` limits)
3. Call `vat.grab()` to confiscate collateral → move to Clipper
4. Call `vow.fess()` to queue the bad debt
5. Call `clipper.kick()` to start a Dutch auction

Supports **partial liquidation** — if the full vault would exceed auction limits, only a portion is liquidated (unless the remainder would be "dusty").

### 1.5 Clipper — Dutch Auction Engine

**Source:** `dss/src/clip.sol`

The Clipper runs descending-price (Dutch) auctions for liquidated collateral.

**Auction parameters:**
- `buf` — Starting price multiplier (e.g., 1.2× feed price)
- `tail` — Maximum auction duration before reset
- `cusp` — Maximum price drop before reset
- `chip/tip` — Keeper incentives (percentage + flat fee)

**Key functions:**
- `kick(tab, lot, usr, kpr)` — Start auction with `lot` collateral to raise `tab` DAI
- `take(id, amt, max, who, data)` — Buy collateral at current price (supports flash loans via callback)
- `redo(id, kpr)` — Reset expired/stale auction

**Price curve:** Uses an `AbacusLike` calculator — typically exponential or linear decay from `top` (starting price).

**Key insight for GoodStable:** Dutch auctions are gas-efficient (single transaction to buy) vs. English auctions (multiple bids). The `take` function supports flash-loan-like callbacks for instant arbitrage.

### 1.6 Vow — System Surplus/Debt Engine

**Source:** `dss/src/vow.sol`

The Vow manages the system's balance sheet — surplus DAI from stability fees and bad debt from liquidations.

**Key mechanisms:**
- `fess(tab)` — Queue bad debt from liquidations (called by Dog)
- `flog(era)` — Release queued debt after `wait` delay
- `heal(rad)` — Cancel matching surplus and debt
- `flap()` — Trigger surplus auction (sell DAI for MKR → burn MKR)
- `flop()` — Trigger debt auction (mint MKR, sell for DAI to cover shortfall)

**Parameters:**
- `bump` — Surplus auction lot size
- `hump` — Surplus buffer (minimum surplus before auctions)
- `dump` — Debt auction initial MKR lot
- `sump` — Debt auction DAI target

**Key insight for GoodStable:** The Vow is where we intercept surplus for UBI. Instead of surplus auctions burning MKR, we redirect to the UBI pool.

### 1.7 Pot — Dai Savings Rate (DSR)

**Source:** `dss/src/pot.sol`

The Pot implements the DAI Savings Rate — users deposit DAI to earn yield.

- `dsr` — Per-second savings rate [ray]
- `chi` — Rate accumulator (grows over time)
- `pie[usr]` — Normalized savings balance per user

**Functions:**
- `drip()` — Accrue interest (calls `vat.suck` to create new DAI from system debt)
- `join(wad)` — Deposit DAI
- `exit(wad)` — Withdraw DAI + accrued interest

**Key insight for GoodStable:** We can skip DSR initially — our "savings rate" is UBI distribution instead.

### 1.8 Flapper/Flopper — Auction Houses

**Flapper** (`flap.sol`): Surplus auction — sells DAI for governance tokens (MKR), then burns the MKR. This is the protocol's buyback-and-burn mechanism.

**Flopper** (`flop.sol`): Debt auction — mints governance tokens (MKR) and sells them for DAI to recapitalize the system. Last-resort backstop.

**Key insight for GoodStable:** We replace the Flapper with a UBI distribution mechanism. The Flopper could mint G$ as a last resort (or use a reserve fund).

### 1.9 Join Adapters

**Source:** `dss/src/join.sol`

Join adapters are the bridges between external ERC-20 tokens and the Vat's internal accounting.

- **GemJoin** — For standard ERC-20 collateral tokens. `join()` transfers tokens in and credits the Vat; `exit()` does the reverse.
- **ETHJoin** — For native ETH (wraps to internal accounting)
- **DaiJoin** — For DAI itself. `join()` burns external DAI and credits internal DAI; `exit()` mints external DAI from internal balance.

Each adapter is authorized against the Vat and handles the translation between external token decimals and the Vat's internal 18-decimal `wad` format.

### Architecture Diagram

```
                    ┌──────────────┐
                    │   Spotter    │ ← Price Oracles (Pip)
                    │  (spot.sol)  │
                    └──────┬───────┘
                           │ poke()
    ┌──────────┐    ┌──────▼───────┐    ┌──────────┐
    │ GemJoin  │───►│     Vat      │◄───│ DaiJoin  │
    │(join.sol)│    │  (vat.sol)   │    │(join.sol)│
    └──────────┘    │              │    └──────────┘
                    │ Core State:  │
                    │ ilks, urns,  │
                    │ gem, dai,sin │
                    └──┬───┬───┬──┘
                       │   │   │
              ┌────────┘   │   └────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │   Jug    │ │   Dog    │ │   Vow    │
        │(jug.sol) │ │(dog.sol) │ │(vow.sol) │
        │ Fees     │ │ Liquidn  │ │ Surplus  │
        └──────────┘ └────┬─────┘ └──┬───┬──┘
                          │          │   │
                    ┌─────▼────┐  ┌──▼─┐ ┌▼────┐
                    │ Clipper  │  │Flap│ │Flop │
                    │(clip.sol)│  └────┘ └─────┘
                    └──────────┘
```

---

## 2. How DAI Works

### 2.1 CDP (Vault) Mechanics

A **Collateralized Debt Position** (CDP), now called a **Vault** in Maker, allows users to:

1. **Lock collateral** — Deposit ETH, WBTC, or other approved tokens
2. **Generate DAI** — Borrow DAI against the locked collateral
3. **Repay + withdraw** — Return DAI to unlock collateral

**Step-by-step flow:**

```
User → GemJoin.join(collateral)     # Lock tokens, get internal gem balance
     → Vat.frob(ilk, u, v, w,      # Modify vault:
              +dink,                 #   Add collateral (ink += dink)
              +dart)                 #   Add debt (art += dart)
     → DaiJoin.exit(dai_amount)     # Convert internal DAI to ERC-20 DAI
```

**To repay and close:**
```
User → DaiJoin.join(dai_amount)     # Burn external DAI, get internal DAI
     → Vat.frob(ilk, u, v, w,      # Modify vault:
              -dink,                 #   Remove collateral
              -dart)                 #   Remove debt
     → GemJoin.exit(collateral)     # Withdraw tokens
```

### 2.2 Collateral Ratio Enforcement

The Vat's `frob()` enforces safety through this check:

```solidity
// urn is either less risky than before, or it is safe
require(either(both(dart <= 0, dink >= 0), tab <= _mul(urn.ink, ilk.spot)));
```

Where `tab = art × rate` (actual debt) and `ilk.spot = price / mat` (price with safety margin).

This means: **You can only make a vault riskier if it remains above the minimum collateral ratio.**

### 2.3 Minting and Burning

- **Minting:** When a user generates DAI via `frob()`, the Vat increases `dai[w]` (internal DAI balance). The user then calls `DaiJoin.exit()` which calls `dai.mint()` to create the ERC-20 token.

- **Burning:** When repaying, `DaiJoin.join()` calls `dai.burn()` to destroy the ERC-20 token and credits the internal balance, which is then used in `frob()` to reduce debt.

### 2.4 Normalized vs. Actual Debt

A crucial concept: the Vat stores **normalized** debt (`art`), not actual debt.

```
Actual debt = art × rate
```

As `rate` increases over time (via stability fees), the same `art` represents more DAI owed. This is how interest accrues without updating every vault.

### 2.5 Collateral Types in Production MakerDAO

| Collateral | Liquidation Ratio | Stability Fee | Notes |
|-----------|-------------------|---------------|-------|
| ETH-A | 145% | ~2% | Main vault |
| ETH-B | 130% | ~4% | Higher risk, lower ratio |
| ETH-C | 170% | ~0.5% | Conservative |
| WBTC-A | 145% | ~2% | Bitcoin |
| USDC-A | 101% | 0% | PSM-like |
| stETH | 155% | ~2% | Lido staked ETH |

---

## 3. Stability Fee

### 3.1 How It's Collected

The stability fee is the "interest rate" charged on DAI borrowing. It accrues continuously and is collected when anyone calls `Jug.drip(ilk)`.

**Mathematical model:**

```
rate_new = (base + duty)^(elapsed_seconds) × rate_old
```

Where:
- `base` = global per-second rate (applies to all collateral types)
- `duty` = per-ilk per-second rate (collateral-specific)
- Both are expressed as ray values slightly above 1.0

**Example:** For 2% annual fee:
- Per-second multiplier: `1 + 2%/year ≈ 1.000000000627937192491029810` (as ray)
- After 1 year: `rate` grows by ~2%
- A vault with 100 DAI normalized debt now owes ~102 DAI actual

### 3.2 Where It Goes

When `drip()` is called:
1. `Jug` calculates `rate_new - rate_old`
2. Calls `Vat.fold(ilk, vow, rate_diff)` — this credits the difference to the Vow's DAI balance
3. The Vow accumulates this surplus
4. When surplus exceeds `hump` (buffer), `Vow.flap()` triggers a surplus auction
5. Surplus DAI is sold for MKR tokens, which are burned

**Flow of fees:**
```
Vault Owners → (implicit via rate increase) → Vow (surplus buffer) → Flapper → MKR burn
```

### 3.3 Mapping to UBI (GoodStable Design)

For GoodStable, we intercept the fee flow:

```
Vault Owners → Vow → UBIFeeSplitter:
    ├── 33% → UBI Pool (GoodDollar distribution)
    ├── 33% → Protocol Reserve (safety buffer)
    └── 34% → G$ buyback-and-distribute
```

Instead of burning a governance token, stability fees fund Universal Basic Income.

---

## 4. Liquidation System

### 4.1 Overview

When a vault's collateral value drops below the minimum ratio, anyone can trigger liquidation to protect the system from bad debt.

### 4.2 Dog — Triggering Liquidation

**`bark(ilk, urn, kpr)`** checks:
```solidity
require(spot > 0 && mul(ink, spot) < mul(art, rate), "Dog/not-unsafe");
```

If `collateral_value < debt` (with safety margin applied), the vault is liquidatable.

**Partial liquidation:** The Dog respects global (`Hole`) and per-ilk (`hole`) auction limits. If liquidating the full vault would exceed limits, only a portion is liquidated — unless the remainder would be below the dust threshold.

### 4.3 Clipper — Dutch Auction Mechanics

The Clipper uses **descending-price Dutch auctions**:

1. **Start:** Price begins at `top = feedPrice × buf` (e.g., 120% of oracle price)
2. **Decline:** Price decreases over time according to the `AbacusLike` calculator
3. **Purchase:** Anyone calls `take()` to buy collateral at the current price
4. **Settlement:** DAI goes to the Vow, leftover collateral returns to vault owner

**Advantages over English auctions (Maker v1):**
- Single-transaction purchase (gas efficient)
- No capital lockup (buyers don't bid and wait)
- Flash-loan-compatible via `ClipperCallee` callback
- Faster — no bidding wars needed

**Price decay models (Abacus):**
- **LinearDecrease** — Price drops linearly to 0 over `tau` seconds
- **StairstepExponentialDecrease** — Steps down by `cut` factor every `step` seconds
- **ExponentialDecrease** — Continuous exponential decay

### 4.4 Liquidation Incentives

- `tip` — Flat DAI reward for the keeper who calls `bark()` [rad]
- `chip` — Percentage of debt as additional reward [wad]
- `chop` — Liquidation penalty (e.g., 13%) — extra DAI the auction must raise beyond the vault's debt

The `chop` penalty protects the system — auctions raise more than the debt, creating surplus.

### 4.5 Safety Mechanisms

- **Circuit breaker** (`stopped` flag): Can halt new auctions (level 1), resets (level 2), or purchases (level 3)
- **Auction limits**: `Hole`/`hole` prevent too many simultaneous auctions from crashing the price
- **Dust protection**: Prevents tiny uneconomical auctions
- **Redo mechanism**: Resets stale auctions where the price has decayed too far

---

## 5. Peg Stability Module (PSM)

### 5.1 What It Is

The PSM is a mechanism to maintain DAI's $1 peg by allowing direct 1:1 swaps between DAI and approved stablecoins (primarily USDC).

### 5.2 How It Works

The PSM operates as a special vault type with:
- **101% collateral ratio** (essentially 1:1 with tiny buffer)
- **0% stability fee**
- **Two functions:**
  - `sellGem(usr, gemAmt)` — Deposit USDC, receive DAI (minus `tin` fee)
  - `buyGem(usr, gemAmt)` — Deposit DAI, receive USDC (minus `tout` fee)

**Parameters:**
- `tin` — Fee for selling gems (depositing USDC, getting DAI). Usually 0% or very small.
- `tout` — Fee for buying gems (depositing DAI, getting USDC). Usually 0% or very small.

### 5.3 Peg Maintenance Mechanism

**When DAI > $1 (premium):**
- Arbitrageurs `sellGem()` — deposit USDC, get DAI at $1
- Sell DAI on market for >$1
- This increases DAI supply, pushing price back to $1

**When DAI < $1 (discount):**
- Arbitrageurs buy cheap DAI on market
- `buyGem()` — deposit DAI, get USDC at $1
- This decreases DAI supply, pushing price back to $1

### 5.4 Impact

The PSM has been enormously effective — it's the primary reason DAI maintained its peg through 2022-2024 market volatility. However, it made DAI heavily dependent on USDC (at one point >50% of DAI backing was USDC via PSM).

### 5.5 GoodStable PSM Design

For gUSD, we implement a similar PSM for USDC:
- 101% ratio, 0% stability fee
- `tin` = 0.1% (small fee goes to UBI pool)
- `tout` = 0.1%
- Debt ceiling capped to prevent over-reliance on USDC

---

## 6. Governance

### 6.1 MakerDAO Governance Model

**MKR Token:** Governance token used for:
- Voting on system parameters (stability fees, debt ceilings, collateral types)
- Serving as lender of last resort (Flopper mints MKR to cover bad debt)
- Receiving surplus value (Flapper burns MKR with surplus DAI)

**Voting mechanism:**
1. **Polling** — Off-chain signal voting via MKR weight
2. **Executive Votes** — On-chain votes that deploy "spells" (governance actions)
3. **Governance Security Module (GSM)** — Time-delay on executive actions (24-48h)

**Executive Spells:**
- Smart contracts that call `file()` functions on system contracts
- Example: Change ETH-A stability fee from 2% to 3%
- Deployed as a contract, voted on, then executed after delay

### 6.2 Governance Risks

- **Governance attacks** — If 51% of MKR is acquired, attacker could drain all collateral
- **Voter apathy** — Low participation can make attacks cheaper
- **Complexity** — Many parameters to manage across dozens of collateral types

### 6.3 GoodStable Governance (Simplified)

**Phase 1 — Admin-controlled (Launch):**
- Multi-sig (3-of-5) controls all parameters
- Team can adjust fees, add collateral, set ceilings
- Timelock (24h) on all parameter changes
- Emergency pause (immediate) for critical issues

**Phase 2 — GoodDAO governance (6-12 months post-launch):**
- GOOD token (or G$) weighted voting
- Parameter changes require governance vote
- GoodDAO votes on: stability fees, collateral types, UBI split ratios
- Emergency admin retained for critical security actions

**Phase 3 — Full decentralization:**
- Remove emergency admin
- All changes via governance
- GSM-style timelock on all actions

---

## 7. Liquity Comparison

### 7.1 Overview

**Liquity** (LUSD) is a stablecoin protocol that took a radically different approach from MakerDAO: **no governance, no ongoing fees, ETH-only collateral.**

Source: `liquity/packages/contracts/contracts/`

### 7.2 Key Differences from MakerDAO

| Feature | MakerDAO | Liquity |
|---------|----------|---------|
| Governance | MKR token voting | No governance — immutable contracts |
| Fee model | Ongoing stability fee (interest) | One-time borrowing fee (0.5-5%) |
| Collateral | Multi-collateral | ETH only |
| Liquidation | Dutch auctions (Clipper) | Stability Pool first, then redistribution |
| Minimum CR | Varies (130-170%) | 110% |
| Oracle | Custom OSM with delay | Chainlink + Tellor |
| Peg mechanism | PSM + DSR | Redemption mechanism |

### 7.3 One-Time Fee Model

Instead of ongoing interest, Liquity charges a **one-time borrowing fee** that varies based on recent redemption activity:

```
Fee = baseRate + 0.5%
```

Where `baseRate` increases with redemptions and decays over time. Range: 0.5% to 5%.

**Advantage:** Predictable cost. Users know upfront what they'll pay.
**Disadvantage:** No ongoing revenue stream for the protocol. Harder to adjust monetary policy.

### 7.4 Stability Pool

The Stability Pool is Liquity's primary liquidation mechanism:

1. Users deposit LUSD into the Stability Pool
2. When a trove is liquidated, the pool absorbs the debt (LUSD is burned)
3. Depositors receive the liquidated collateral (ETH) proportionally
4. Since liquidation happens at <110% CR, depositors get ETH at a discount

**Mathematical tracking:** Uses a clever O(1) algorithm with running products (`P`) and sums (`S`) to track each depositor's share without iterating over all depositors.

**Why it's better than auctions:**
- Instant — no auction period needed
- No keeper infrastructure required
- Capital already committed (not relying on external arbitrageurs)
- No possibility of failed auctions

### 7.5 Recovery Mode

When the **Total Collateral Ratio (TCR)** of the entire system drops below 150%, Liquity enters **Recovery Mode:**
- Troves with CR < 150% (instead of normal 110%) can be liquidated
- Borrowing is restricted to only troves that improve the TCR
- Encourages users to add collateral or repay debt

### 7.6 Redemption Mechanism (Peg Maintenance)

When LUSD < $1, anyone can **redeem** LUSD for ETH at face value:
- System finds the riskiest trove (lowest CR)
- Redeemer sends LUSD, receives ETH from that trove
- This reduces LUSD supply and creates a price floor at $1

### 7.7 Lessons for GoodStable

**Adopt from Liquity:**
- ✅ Stability Pool for liquidations (simpler, more reliable than auctions)
- ✅ One-time fee option for certain collateral types
- ✅ Recovery Mode concept for system-wide protection

**Don't adopt:**
- ❌ No governance (we need governance for UBI parameter tuning)
- ❌ ETH-only (we need multi-collateral including G$)
- ❌ Immutable contracts (we need upgradeability for L2 evolution)

---

## 8. crvUSD Comparison

### 8.1 Overview

**crvUSD** is Curve Finance's stablecoin, launched in 2023. Its key innovation is the **LLAMMA** (Lending-Liquidating AMM Algorithm) — a novel approach that replaces hard liquidations with continuous "soft liquidations."

### 8.2 LLAMMA Algorithm

Traditional systems: Collateral is either safe or liquidated (binary). crvUSD: Collateral continuously converts between the collateral asset and crvUSD as prices move.

**How it works:**

1. When a user opens a loan, their collateral is deposited into a **specialized AMM**
2. The AMM has discrete **price bands** — a user's collateral is spread across multiple bands
3. As the collateral price drops:
   - Collateral in bands above the current price remains as the original asset
   - Collateral in bands at or below the current price is **automatically converted to crvUSD**
   - This is essentially selling collateral gradually as the price falls
4. If the price recovers:
   - crvUSD is converted back to collateral
   - The user's position is restored (minus swap fees/losses)

**Price bands:**
```
Band N+2: [2100, 2200]  → All ETH (price above band)
Band N+1: [2000, 2100]  → All ETH
Band N:   [1900, 2000]  → Mix of ETH and crvUSD (current price in this band)
Band N-1: [1800, 1900]  → All crvUSD (price below band)
Band N-2: [1700, 1800]  → All crvUSD
```

### 8.3 Soft Liquidations

- **No penalty** — Unlike Maker's 13% liquidation penalty, soft liquidation is just an AMM swap with fees
- **Reversible** — If price recovers, you get your collateral back
- **Gradual** — Not a cliff event; position degrades smoothly
- **IL-like loss** — Users suffer impermanent-loss-like effects during price oscillation

### 8.4 Hard Liquidation (Fallback)

If soft liquidation isn't enough and a position's health drops below 0, a **hard liquidation** occurs:
- The remaining assets (mostly crvUSD from soft liquidation) are used to repay the debt
- Any leftover is returned to the user
- This is still less punishing than traditional liquidation

### 8.5 PegKeeper

crvUSD uses **PegKeepers** — contracts that can mint/burn crvUSD into specific Curve pools:
- When crvUSD > $1: PegKeeper mints crvUSD and deposits into the pool
- When crvUSD < $1: PegKeeper withdraws and burns crvUSD

This is similar to MakerDAO's PSM but operates through AMM pools.

### 8.6 Lessons for GoodStable

**Adopt from crvUSD:**
- ✅ Concept of gradual liquidation for G$ collateral (high volatility asset)
- ✅ PegKeeper-like mechanism for AMM pool stabilization

**Don't adopt (initially):**
- ❌ Full LLAMMA — too complex for initial deployment
- ❌ Band-based AMM — requires deep liquidity

**Future consideration:** For G$ as collateral, a soft-liquidation mechanism could be beneficial given G$'s higher volatility. This could be a Phase 2 feature.

---

## 9. GoodStable Design Document

### 9.1 Overview

**GoodStable (gUSD)** is a USD-pegged stablecoin for the GoodDollar L2 ecosystem. Its unique property: **all protocol revenue flows to Universal Basic Income (UBI).**

**Design philosophy:**
- Simplified MakerDAO architecture (fewer contracts, clearer interfaces)
- Liquity-inspired Stability Pool for liquidations
- PSM for tight peg maintenance
- All surplus → UBI pool

### 9.2 gUSD Stablecoin Specification

```
Name:           GoodStable Dollar
Symbol:         gUSD
Decimals:       18
Standard:       ERC-20 with permit (EIP-2612)
Network:        GoodDollar L2 (Fuse-based / future OP Stack)
Peg target:     1 USD
Backing:        Over-collateralized + PSM
Max supply:     Determined by debt ceilings
```

**Token characteristics:**
- Mintable only by the CDPManager contract
- Burnable by anyone (holder or approved spender)
- EIP-2612 permit for gasless approvals
- Pausable by admin (emergency only)

### 9.3 Collateral Types

#### ETH Vaults
| Parameter | Value |
|-----------|-------|
| Liquidation Ratio | 150% |
| Stability Fee | 2% annual |
| Liquidation Penalty | 10% |
| Debt Ceiling | 1,000,000 gUSD |
| Dust (minimum debt) | 100 gUSD |
| Oracle | Chainlink ETH/USD |

#### G$ Vaults
| Parameter | Value |
|-----------|-------|
| Liquidation Ratio | 200% |
| Stability Fee | 0% (incentivize G$ locking) |
| Liquidation Penalty | 15% |
| Debt Ceiling | 500,000 gUSD |
| Dust (minimum debt) | 50 gUSD |
| Oracle | GoodDollar Reserve Oracle + Chainlink |

**Rationale for 200% ratio:** G$ is more volatile than ETH. The higher ratio provides safety buffer while encouraging G$ holders to generate stablecoins for DeFi usage.

**Rationale for 0% fee:** We WANT G$ to be locked as collateral — it reduces circulating supply and increases demand for G$.

#### USDC PSM
| Parameter | Value |
|-----------|-------|
| Collateral Ratio | 101% |
| Stability Fee | 0% |
| Swap Fee (tin/tout) | 0.1% |
| Debt Ceiling | 2,000,000 gUSD |
| Mechanism | Direct 1:1 swap (PSM) |

### 9.4 Fee Distribution — UBIFeeSplitter

All protocol revenue is split via the **UBIFeeSplitter** contract:

```
┌─────────────────────────┐
│    Revenue Sources       │
├─────────────────────────┤
│ • Stability fees (Jug)  │
│ • Liquidation penalties │
│ • PSM swap fees         │
│ • Liquidation surplus   │
└───────────┬─────────────┘
            │
            ▼
┌───────────────────────┐
│    UBIFeeSplitter     │
│                       │
│  33% → UBI Pool       │  ← Direct G$ distribution to claimers
│  33% → Reserve Fund   │  ← Protocol safety buffer
│  34% → G$ Buyback     │  ← Buy G$ on market, distribute
└───────────────────────┘
```

**Liquidation surplus:** When a liquidation raises more than the vault's debt (due to the liquidation penalty), 100% of the surplus goes to the UBI pool. This means liquidations directly fund UBI.

**Implementation:**
```solidity
function splitFees(uint256 amount) external {
    uint256 ubiShare = amount * 33 / 100;
    uint256 reserveShare = amount * 33 / 100;
    uint256 buybackShare = amount - ubiShare - reserveShare;
    
    gUSD.transfer(ubiPool, ubiShare);
    gUSD.transfer(reserveFund, reserveShare);
    gUSD.transfer(buybackContract, buybackShare);
}
```

### 9.5 Liquidation Design — Stability Pool

Inspired by Liquity, GoodStable uses a **Stability Pool** instead of Dutch auctions:

1. **Users deposit gUSD** into the Stability Pool
2. **When a vault is liquidated:**
   - gUSD from the pool absorbs the vault's debt (burned)
   - Pool depositors receive the vault's collateral at a discount
   - The liquidation penalty (surplus) goes to UBI
3. **Fallback:** If the Stability Pool is empty, use Dutch auction (Clipper-style)

**Incentives for Stability Pool depositors:**
- Receive liquidated collateral at 10-15% discount
- Optional: G$ rewards for participating

### 9.6 Simplified Governance

**Phase 1 — Admin-Controlled (Launch → +6 months):**
```
Admin Multi-sig (3-of-5):
  ├── Set stability fees
  ├── Add/remove collateral types  
  ├── Adjust debt ceilings
  ├── Adjust liquidation ratios
  ├── Set UBI split percentages
  ├── Emergency pause
  └── Upgrade contracts (proxy pattern)

Timelock: 24h on all non-emergency actions
Emergency: Instant pause, 48h timelock on unpause
```

**Phase 2 — GoodDAO (6-12 months):**
- G$ or GOOD token voting
- Proposals require minimum stake
- 3-day voting period, 2-day timelock
- Emergency multi-sig retained

### 9.7 Contract Architecture

```
┌─────────────────────────────────────────────┐
│                  GoodStable                  │
├─────────────────────────────────────────────┤
│                                             │
│  GoodStableToken.sol (gUSD ERC-20)          │
│       ↑ mint/burn                           │
│  CDPManager.sol (open/manage/close vaults)  │
│       ↕ collateral in/out                   │
│  CollateralJoin.sol (deposit/withdraw)      │
│       ↕ price feeds                         │
│  PriceOracle.sol (Chainlink adapter)        │
│       ↕ liquidation                         │
│  StabilityPool.sol (liquidation backstop)   │
│       ↓ surplus                             │
│  UBIFeeSplitter.sol (fee distribution)      │
│                                             │
│  PSM.sol (USDC ↔ gUSD swaps)               │
│  GoodStableGovernor.sol (admin/timelock)    │
└─────────────────────────────────────────────┘
```

### 9.8 Deployment Plan

**Phase 1: Testnet (Month 1-2)**
- Deploy all contracts to GoodDollar L2 testnet
- Internal testing with mock oracles
- Security review of core contracts (CDPManager, StabilityPool)

**Phase 2: Limited Launch (Month 3-4)**
- Deploy to mainnet with low debt ceilings
- ETH collateral only (simplest, most liquid)
- PSM with small USDC ceiling
- Whitelist-only access

**Phase 3: Public Launch (Month 5-6)**
- Remove whitelist
- Add G$ collateral type
- Increase debt ceilings based on demand
- Launch Stability Pool incentives

**Phase 4: Growth (Month 7-12)**
- Add additional collateral types (WBTC, stETH, etc.)
- Transition to GoodDAO governance
- Cross-chain bridge for gUSD
- Integration with GoodDollar UBI claims (claim in gUSD option)

### 9.9 Risk Analysis

| Risk | Severity | Mitigation |
|------|----------|------------|
| Oracle failure | Critical | Dual oracle (Chainlink + GD reserve), circuit breaker |
| Mass liquidation cascade | High | Stability Pool buffer, auction limits, Recovery Mode |
| Smart contract bug | Critical | Audit, formal verification of core math, upgrade capability |
| G$ price collapse | High | 200% CR, separate debt ceiling, emergency pause |
| USDC depeg | Medium | PSM debt ceiling cap, circuit breaker at ±2% deviation |
| Governance attack | Medium | Timelock, emergency pause, multi-sig |

---

## 10. Initial Solidity Contracts

All contracts are located in `/home/goodclaw/gooddollar-l2/research/maker-dai/contracts/`:

- `GoodStableToken.sol` — gUSD ERC-20 token
- `CDPManager.sol` — Vault management (open, deposit, borrow, repay, close)
- `CollateralJoin.sol` — Collateral adapter
- `StabilityPool.sol` — Liquidation backstop
- `PriceOracle.sol` — Chainlink oracle integration
- `UBIFeeSplitter.sol` — Fee distribution to UBI

See the `/contracts/` directory for full implementations.

---

## Appendix A: Key Constants and Math

### Fixed-Point Arithmetic

Following MakerDAO's convention:
```
WAD = 10^18  (token amounts, ratios)
RAY = 10^27  (rates, per-second compounding values)
RAD = 10^45  (high-precision internal accounting)
```

### Stability Fee Examples

| Annual Rate | Per-Second Ray Value |
|------------|---------------------|
| 0.5% | 1000000000158153903837946258 |
| 1.0% | 1000000000315522921573372069 |
| 2.0% | 1000000000627937192491029810 |
| 5.0% | 1000000001547125957863212448 |

### Collateral Ratio Formula

```
CR = (collateral_amount × price) / debt
Required: CR ≥ liquidation_ratio (mat)

For frob() check:
  spot = price / mat
  ink × spot ≥ art × rate
```

---

## Appendix B: Protocol Comparison Summary

| Feature | MakerDAO | Liquity | crvUSD | **GoodStable** |
|---------|----------|---------|--------|----------------|
| Stablecoin | DAI | LUSD | crvUSD | **gUSD** |
| Collateral | Multi | ETH only | Multi | **Multi (ETH, G$, USDC)** |
| Fee Model | Ongoing rate | One-time | Ongoing rate | **Ongoing → UBI** |
| Liquidation | Dutch auction | Stability Pool | Soft (LLAMMA) | **Stability Pool + auction fallback** |
| Governance | MKR voting | None | veCRV voting | **Admin → GoodDAO** |
| Peg | PSM | Redemptions | PegKeeper | **PSM** |
| Surplus use | MKR burn | LQTY staking | veCRV | **100% to UBI** |
| Min CR | 130-170% | 110% | ~125% | **101-200%** |
| Oracle | OSM (delayed) | Chainlink+Tellor | Chainlink | **Chainlink** |

---

*Research compiled from direct source code analysis of MakerDAO DSS, Liquity v1, and public documentation on crvUSD/LLAMMA.*
