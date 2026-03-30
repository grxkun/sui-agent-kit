<p align="center">
  <img src="assets/banner.png" alt="sui-agent-kit" width="100%" />
</p>

<p align="center">
  <strong>The missing middleware layer between Sui's L1 primitives and real-world AI agent applications.</strong>
</p>

<p align="center">
  <a href="#modules">Modules</a> · <a href="#quickstart">Quickstart</a> · <a href="#architecture">Architecture</a> · <a href="#sdk">SDK</a> · <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Sui-Move-4da2ff?style=flat-square" alt="Sui Move" />
  <img src="https://img.shields.io/badge/TypeScript-SDK-3178c6?style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

---

## What is this?

**sui-agent-kit** is an open-source composable module layer for agentic economics on Sui — analogous to `x402 + ERC-8004 + Google AP2` on EVM, but native to Sui's object model.

It provides the foundational primitives that autonomous AI agents need to operate on-chain: identity, delegation, reputation, payments, task markets, messaging, and persistent memory. Every module is a standalone Move package that composes with the rest.

---

## Modules

| Module | Move Package | What it does |
|--------|-------------|--------------|
| **Agent Identity** | `sui_agent_identity` | Soulbound AgentCard objects with capabilities, metadata, and ownership |
| **Delegation** | `sui_delegation` | Scoped permission grants between agents with expiry and spend limits |
| **Task Market** | `sui_task_market` | Post, claim, fulfill, and dispute tasks with escrowed SUI rewards |
| **Reputation** | `sui_reputation` | On-chain scoring updated by task outcomes and peer attestations |
| **x402 Payments** | `sui_x402_pay` | HTTP 402-style micropayments and streaming payment channels |
| **Messaging** | `sui_agent_messaging` | Agent-to-agent messaging with channels and typed payloads |
| **Walrus Memory** | `sui_walrus_memory` | Persistent key-value memory backed by Walrus decentralized storage |

---

## Quickstart

### Install

```bash
npm install @grxkun/sui-agent-kit
```

### Register an agent

```typescript
import { SuiAgentKit } from "@grxkun/sui-agent-kit";
import { registerNetwork, createClient } from "@grxkun/sui-agent-kit/config";

// 1. Register your deployed package addresses
registerNetwork("testnet", {
  agentIdentity: "0x...",
  taskMarket: "0x...",
  reputation: "0x...",
});

// 2. Initialize
const client = createClient("testnet");
const kit = new SuiAgentKit(client, keypair);

// 3. Register
const agent = await kit.registerAgent({
  name: "DataFetcher",
  capabilities: ["data", "api"],
});
```

### Claim and fulfill a task

```typescript
import { retryWithBackoff, estimateGas } from "@grxkun/sui-agent-kit/utils";

// Claim with automatic retry on network errors
const result = await retryWithBackoff(
  () => kit.claimTask({ taskId: "0x...", agentId: agent.id }),
  { maxAttempts: 3 }
);

// Fulfill
await kit.fulfillTask({
  taskId: "0x...",
  agentId: agent.id,
  resultData: JSON.stringify({ price: 1.42 }),
});
```

### Subscribe to events

```typescript
import { createEventHelpers } from "@grxkun/sui-agent-kit/utils";

const events = createEventHelpers(client, PACKAGE_ID);

events.onTaskPosted(async (task) => {
  console.log("New task:", task.title);
  if (task.capability === "data") {
    await kit.claimTask({ taskId: task.id, agentId: myAgent.id });
  }
});

// Cleanup
events.destroy();
```

### Batch transactions

```typescript
import { BatchBuilder, batchClaimTasks } from "@grxkun/sui-agent-kit/utils";

// Claim 5 tasks in a single PTB
const calls = batchClaimTasks(PACKAGE_ID, taskIds, agentId, boardId);

const batch = new BatchBuilder(client, signer)
  .addAll(calls);

const result = await batch.execute();
```

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  AI Agent (LLM / Autonomous Loop)                    │
├──────────────────────────────────────────────────────┤
│  TypeScript SDK (@grxkun/sui-agent-kit)              │
│  ┌──────────┬──────────┬──────────┬────────────────┐ │
│  │  Retry   │   Gas    │  Events  │   Validation   │ │
│  │  Engine  │  Estimator│  Sub    │   (Zod)        │ │
│  └──────────┴──────────┴──────────┴────────────────┘ │
├──────────────────────────────────────────────────────┤
│  Move Modules (on-chain)                             │
│  ┌─────────┬───────────┬──────────┬───────────────┐  │
│  │Identity │ Delegation│  Tasks   │  Reputation   │  │
│  ├─────────┼───────────┼──────────┼───────────────┤  │
│  │ x402 Pay│ Messaging │  Memory  │   (Walrus)    │  │
│  └─────────┴───────────┴──────────┴───────────────┘  │
├──────────────────────────────────────────────────────┤
│  Sui L1                                              │
└──────────────────────────────────────────────────────┘
```

---

## SDK Utilities

The SDK ships with production-grade utilities that make the difference between a demo and a real deployment:

**Error Handling & Retry** — Exponential backoff with jitter, automatic error classification (gas, network, object-not-found), and configurable retry policies.

**Gas Estimation** — Dry-run simulation to compute exact gas costs with configurable buffers. No more default gas budgets that overpay or fail.

**Event Subscriptions** — Polling-based event listener with cursor management, field-level filtering, and typed helpers for all kit events. Agents react to on-chain events instead of sleeping and polling raw RPC.

**Input Validation** — Zod schemas for every SDK method. Malformed inputs get caught in TypeScript before they waste gas on a Move abort.

**Transaction Batching** — Compose multiple Move calls into a single PTB. Claiming 10 tasks = 1 transaction.

**Network Config** — Register package addresses per network. Switch between testnet and mainnet with one line.

---

## Project Structure

```
sui-agent-kit/
├── move/
│   ├── sui_agent_identity/     # AgentCard, capabilities
│   ├── sui_delegation/         # Scoped permissions
│   ├── sui_task_market/        # Task lifecycle + escrow
│   ├── sui_reputation/         # On-chain scoring
│   ├── sui_x402_pay/           # Micropayments, streams
│   ├── sui_agent_messaging/    # Agent-to-agent comms
│   └── sui_walrus_memory/      # Persistent KV store
├── src/
│   ├── config/
│   │   └── networks.ts         # Network registry
│   ├── utils/
│   │   ├── retry.ts            # Error handling + backoff
│   │   ├── gas.ts              # Gas estimation
│   │   ├── events.ts           # Event subscriptions
│   │   ├── validation.ts       # Zod schemas
│   │   ├── batch.ts            # PTB batching
│   │   └── index.ts            # Barrel export
│   └── index.ts                # Main SDK entry
├── assets/
│   └── banner.png
└── package.json
```

---

## Roadmap

- [ ] MCP Server — expose agent operations as tools for Claude Desktop / Cursor
- [ ] `npx create-sui-agent` scaffolding CLI
- [ ] Capability Marketplace — browse, rent, compose audited capability modules
- [ ] Cross-chain identity bridge (Wormhole-backed attestations)
- [ ] Agent telemetry dashboard
- [ ] Security sandbox with per-epoch gas limits

---

## Contributing

PRs welcome. If you're building agents on Sui, this is your toolkit.

```bash
git clone https://github.com/grxkun/sui-agent-kit.git
cd sui-agent-kit
pnpm install
pnpm build
```

---

## License

MIT

