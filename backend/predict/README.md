# GoodPredict Backend

CLOB matching engine and API for GoodPredict prediction markets on GoodDollar L2.

## Architecture

```
┌─────────────────────────────────────────┐
│  REST API (Express)  │  WebSocket (/ws) │
├──────────────────────┴──────────────────┤
│           CLOB Matching Engine           │
│  ┌────────┐ ┌────────┐ ┌────────────┐  │
│  │ Order  │ │ Trade  │ │ Complement │  │
│  │ Books  │ │ Match  │ │ Matching   │  │
│  └────────┘ └────────┘ └────────────┘  │
├──────────────────────────────────────────┤
│  Polymarket Feed  │  Market Resolver    │
└──────────────────────────────────────────┘
```

## Quick Start

```bash
cp .env.example .env
npm install
npm run dev
```

## API

Base URL: `http://localhost:3040/api/v1`

### Markets
- `GET /markets` — List all markets
- `GET /markets/:id` — Get market with orderbook
- `POST /markets` — Create market
- `POST /markets/:id/resolve` — Resolve market
- `POST /markets/:id/void` — Void market

### Orders
- `POST /orders` — Place order
- `DELETE /orders/:id` — Cancel order
- `GET /orders/:id` — Get order
- `GET /orders/maker/:address` — Get orders by maker

### Order Book
- `GET /orderbook/:marketId/:token` — Get order book (YES/NO)
- `GET /midpoint/:marketId/:token` — Get midpoint price

### Price Feeds
- `GET /feeds` — All Polymarket feeds
- `GET /feeds/:marketId` — Feed for specific market
- `POST /feeds/:marketId/link` — Link to Polymarket tokens

### WebSocket
Connect to `ws://localhost:3040/ws`

Subscribe to channels:
```json
{ "type": "subscribe", "channels": ["market:btc-100k", "orderbook:btc-100k:YES"] }
```

Message types: `orderbook_snapshot`, `trade`, `order_update`, `price_update`, `market_update`

## Tests

```bash
npm test
```
