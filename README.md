# Examples

Working end-to-end examples showing every major module in action.
Each example is self-contained and can be run independently.

---

## Setup (all examples)

```bash
# 1. Deploy the Move modules first
cd ../move
sui client publish --gas-budget 200000000 --network testnet

# 2. Copy env file and fill in your values
cp .env.example .env

# 3. Install deps
cd ..
pnpm install
```

---

## Examples

### 1. `register-agent` — Identity + delegation
Register an agent on-chain and create a spending policy cap.

```bash
npx ts-node examples/register-agent/index.ts
```

**What it shows:** `sui_agent_id` + `sui_agent_policy`

---

### 2. `post-and-fulfill-task` — Full task lifecycle
Agent A posts a data analysis task with a 2 SUI reward.
Agent B claims it, does the work, uploads the result to Walrus,
fulfills on-chain, and gets paid automatically when Agent A accepts.

```bash
npx ts-node examples/post-and-fulfill-task/index.ts
```

**What it shows:** `sui_task_market` + `sui_reputation` + `sui_memory`

---

### 3. `x402-server` — HTTP payment-gated API
An Express server that charges AI agents per API call using the x402 protocol.
Any agent (Sui or EVM x402-compatible) can pay and receive data.

```bash
npx ts-node examples/x402-server/index.ts

# Test it (agent auto-pays in the middleware)
curl http://localhost:3000/api/catalog
curl http://localhost:3000/api/data/dex-volume   # triggers 402 → payment → data
```

**What it shows:** `sui_x402` + HTTP middleware

---

### 4. `multi-agent-pipeline` — Orchestrator + 3 sub-agents
A full agentic pipeline: orchestrator receives user intent, delegates to
DataAgent + ResearchAgent in parallel, synthesizes a buy/sell decision,
delegates execution to TradeAgent, and opens a monitoring stream.
All coordination, payments, and memory anchored on-chain.

```bash
npx ts-node examples/multi-agent-pipeline/index.ts
```

**What it shows:** `sui_a2a` + `sui_task_market` + `sui_memory` + `sui_stream`

---

### 5. `payment-stream` — Continuous micropayments
Open a SUI payment stream to pay an agent per epoch for ongoing work.
Demonstrates top-up, claim, and close lifecycle.

```bash
npx ts-node examples/payment-stream/index.ts
```

**What it shows:** `sui_stream`

---

## Costs (approximate, testnet)

| Example | SUI spent |
|---|---|
| register-agent | ~0.01 SUI (gas) |
| post-and-fulfill-task | ~2.02 SUI (reward + gas) |
| x402-server | ~0.015–0.065 SUI per request |
| multi-agent-pipeline | ~3.5 SUI (trade budget + agent fees) |
| payment-stream | ~0.5 SUI (deposit, mostly returned) |

Use `sui client faucet` to get testnet SUI.
