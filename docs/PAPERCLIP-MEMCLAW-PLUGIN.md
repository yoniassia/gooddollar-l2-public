# Paperclip ↔ MemClaw Integration Plugin

> Connect any Paperclip instance to MemClaw for persistent cross-agent memory.

## Overview

This plugin gives all Paperclip agents access to MemClaw (memclaw.net) — a shared semantic memory store. Agents write what they learn, search what others know, and recall context before acting. No more dark matter knowledge.

## Quick Start (5 minutes)

### 1. Get a MemClaw API Key

```bash
# Sign up at memclaw.net or self-host
# You'll get: tenant_id + API key (mc_...)
```

### 2. Save Credentials

```bash
# Create credentials file
cat > /path/to/paperclip/instance/.memclaw.env << 'EOF'
MEMCLAW_API_URL=https://memclaw.net
MEMCLAW_API_KEY=mc_YOUR_KEY_HERE
MEMCLAW_TENANT=your-tenant-id
EOF
```

### 3. Install the Bridge Script

Copy `scripts/memclaw-bridge.sh` into your Paperclip project root:

```bash
cp scripts/memclaw-bridge.sh /your/project/scripts/
chmod +x /your/project/scripts/memclaw-bridge.sh
```

### 4. Add MemClaw to Agent System Prompts

Append this block to every agent's `systemPrompt` in Paperclip:

```
## MemClaw — Shared Fleet Memory

You have access to MemClaw for persistent shared memory across the team.

**API (use curl directly):**
- **Write:** POST https://memclaw.net/api/memories
  Headers: Content-Type: application/json, X-API-Key: YOUR_KEY
  Body: {"tenant_id":"YOUR_TENANT","agent_id":"YOUR_AGENT_NAME","memory_type":"fact|decision|episode|outcome","content":"what happened","visibility":"scope_team"}

- **Search:** POST https://memclaw.net/api/search
  Headers: same
  Body: {"tenant_id":"YOUR_TENANT","query":"natural language query","limit":5}

- **Recall:** POST https://memclaw.net/api/recall
  Headers: same
  Body: {"tenant_id":"YOUR_TENANT","query":"what do we know about X","limit":5}

**Mandatory behaviors:**
1. On startup/heartbeat: search for recent team activity
2. After completing work: write key findings
3. Before non-trivial tasks: search for prior work on the topic
4. Use your agent name as agent_id consistently
```

### 5. Update Agent Prompts via Paperclip API

```bash
COMPANY_ID="your-company-id"
BASE="http://127.0.0.1:3102"

# Get all agents
AGENTS=$(curl -s "$BASE/api/companies/$COMPANY_ID/agents")

# For each agent, PATCH the systemPrompt to include MemClaw instructions
# Example for one agent:
AGENT_ID="abc123"
curl -s "$BASE/api/companies/$COMPANY_ID/agents/$AGENT_ID" \
  -X PATCH \
  -H "Content-Type: application/json" \
  -d '{
    "runtimeConfig": {
      "systemPrompt": "... existing prompt ... \n\n## MemClaw block from above"
    }
  }'
```

## How It Works

```
┌─────────────┐     write/search     ┌──────────────┐
│  Paperclip   │ ──────────────────▶ │   MemClaw    │
│  Agent (any) │ ◀────────────────── │  (memclaw.net)│
└─────────────┘    semantic results   └──────────────┘
       │                                      │
       │  agent_id = "lead-blockchain-eng"    │
       │  tenant_id = shared across fleet     │
       │                                      │
       ▼                                      ▼
  Agent writes what it              All agents search
  learned after work                before starting work
```

**Key concepts:**
- **tenant_id** — shared across all agents in one Paperclip instance
- **agent_id** — unique per agent (use Paperclip agent name/slug)
- **memory_type** — `fact`, `decision`, `episode`, `outcome`, `action`, `semantic`, `task`, `plan`, `commitment`, `preference`
- **visibility** — `scope_team` (readable by all agents in tenant)

## Memory Types Guide

| Type | When to Use | Example |
|------|-------------|---------|
| `fact` | Discovered information | "PerpEngine has 5 markets, only market 0 has oracle prices" |
| `decision` | Architecture/design choice | "Using Uniswap V4 hooks instead of custom router" |
| `episode` | Something that happened | "Deployed GoodLendPool at 0x322... on devnet" |
| `outcome` | Result of an action | "forge test: 345/345 passing after fix" |
| `action` | Something you did | "Fixed ETH theft vector in bridge contract" |
| `task` | Work in progress | "Working on GoodStocks oracle integration" |
| `plan` | Future work planned | "Next: connect frontend swap UI to on-chain pools" |

## Anti-Patterns

❌ **Write-only** — writing memories nobody reads (the #1 problem we found: 99.5% dark matter rate)
❌ **Self-only search** — filtering by your own agent_id defeats cross-agent discovery
❌ **No dates** — "deployed the thing" vs "deployed GoodLendPool on 2026-04-04 at 10:25 UTC"
❌ **Duplicate writes** — search first, update existing memories instead of creating new ones
❌ **Giant dumps** — one memory per topic, not one memory with everything

## Paperclip Agent Prompt Template

Full template for a MemClaw-connected Paperclip agent:

```
## MemClaw — Shared Fleet Memory

**Credentials (use in curl commands):**
- API URL: https://memclaw.net
- API Key: mc_YOUR_KEY (X-API-Key header)
- Tenant: your-tenant-id
- Your agent_id: {AGENT_SLUG}

**On every heartbeat:**
1. Search for recent team activity:
   curl -s https://memclaw.net/api/search -H "Content-Type: application/json" -H "X-API-Key: mc_YOUR_KEY" -X POST -d '{"tenant_id":"your-tenant","query":"recent updates and changes","limit":5}'

2. After completing work, write findings:
   curl -s https://memclaw.net/api/memories -H "Content-Type: application/json" -H "X-API-Key: mc_YOUR_KEY" -X POST -d '{"tenant_id":"your-tenant","agent_id":"{AGENT_SLUG}","memory_type":"outcome","content":"What you did and found","visibility":"scope_team"}'

**Rules:**
- Search before writing (avoid duplicates)
- Include dates in content
- Use natural language queries for search
- Don't filter by agent_id — read the whole team's knowledge
- Write after every significant action, not just at end of session
- Minimum 3 searches per heartbeat cycle
```

## Bulk Setup Script

To add MemClaw to ALL agents in a Paperclip instance:

```bash
#!/bin/bash
# bulk-memclaw-setup.sh
# Adds MemClaw instructions to all Paperclip agent system prompts

COMPANY_ID="${1:?Usage: $0 <company-id>}"
BASE="http://127.0.0.1:3102"
MEMCLAW_KEY="mc_YOUR_KEY"
MEMCLAW_TENANT="your-tenant"

MEMCLAW_BLOCK=$(cat << 'PROMPT'
## MemClaw — Shared Fleet Memory
You have access to MemClaw MCP tools for persistent shared memory across the team.

**On every heartbeat:**
1. Use memclaw_brief("your current task or area") to check what the team already knows
2. After completing work, use memclaw_write to store key findings, decisions, and outcomes
3. Use your agent name as agent_id (e.g. "lead-blockchain-engineer")

**What to store:** Architecture decisions, bug discoveries, deployment notes, test results, blockers found.
**What NOT to store:** Raw code, temporary debug output, routine logs.
PROMPT
)

# Get all agents
AGENTS=$(curl -s "$BASE/api/companies/$COMPANY_ID/agents" | python3 -c "
import sys, json
agents = json.load(sys.stdin)
for a in agents:
    prompt = a.get('runtimeConfig', {}).get('systemPrompt', '')
    if 'MemClaw' not in prompt:
        print(f'{a[\"id\"]}|{a[\"name\"]}')
")

echo "Agents needing MemClaw setup:"
echo "$AGENTS"
echo ""

while IFS='|' read -r agent_id agent_name; do
    [ -z "$agent_id" ] && continue
    echo "Adding MemClaw to: $agent_name ($agent_id)"
    
    # Get current prompt
    CURRENT=$(curl -s "$BASE/api/companies/$COMPANY_ID/agents/$agent_id" | \
        python3 -c "import sys,json; print(json.load(sys.stdin).get('runtimeConfig',{}).get('systemPrompt',''))")
    
    # Append MemClaw block
    NEW_PROMPT="$CURRENT

$MEMCLAW_BLOCK"
    
    # Update agent
    curl -s "$BASE/api/companies/$COMPANY_ID/agents/$agent_id" \
        -X PATCH \
        -H "Content-Type: application/json" \
        -d "$(python3 -c "import json; print(json.dumps({'runtimeConfig': {'systemPrompt': $(python3 -c "import sys,json; print(json.dumps('$NEW_PROMPT'))")}}))")" > /dev/null
    
    echo "  ✅ Done"
done <<< "$AGENTS"

echo "Setup complete!"
```

## Verifying the Integration

After setup, check that agents are actually using MemClaw:

```bash
# Check total memories by agent
curl -s "https://memclaw.net/api/memories?limit=200" \
  -H "X-API-Key: $MEMCLAW_KEY" | python3 -c "
import sys, json
from collections import Counter
items = json.load(sys.stdin).get('items', [])
agents = Counter(m.get('agent_id','unknown') for m in items)
total_recalls = sum(m.get('recall_count',0) for m in items)
print(f'Total memories: {len(items)}')
print(f'Total recalls: {total_recalls}')
for agent, count in agents.most_common():
    print(f'  {agent}: {count} writes')
"

# Target metrics:
# - Every active agent has ≥1 memory per heartbeat cycle
# - Write:search ratio ≤ 2:1
# - Cross-agent recall rate > 10%
# - Zero agents with 0 recalls after 24h
```

## Self-Hosted Alternative

If using self-hosted MemClawz instead of memclaw.net:

```bash
# Change API URL to your local instance
MEMCLAW_API_URL=http://localhost:8080
# Everything else works the same — API is compatible
```

## Architecture Notes

- **No MCP required** — agents use plain HTTP (curl). Works with any LLM adapter.
- **Tenant isolation** — each Paperclip instance gets its own tenant. Cross-instance sharing via fleet_id.
- **Entity extraction** — MemClaw auto-extracts entities on every write. No agent work needed.
- **Semantic dedup** — MemClaw detects near-duplicate writes and warns (check metadata.semantic_dedup_ms).
- **Recall counting** — every search that returns a memory increments its recall_count. Unused memories surface in audits.

---

*Written 2026-04-04 by GoodClaw. Tested on Paperclip v2026.325.0 + MemClaw (memclaw.net).*
