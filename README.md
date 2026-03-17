# sui-agent-kit

> Open-source middleware framework for agentic economics on the Sui blockchain

sui-agent-kit provides composable on-chain modules that give AI agents first-class economic capabilities: identity, delegation, payments, reputation, task markets, payment streams, agent-to-agent messaging, and memory — all native to Sui's object model.

## Why Sui?

| Sui Advantage | How We Use It |
|---|---|
| First-class objects | Every agent, task, policy, and message is an owned/shared object |
| Parallel execution | Agents on disjoint state never block each other |
| Programmable Transaction Blocks | Payment + instruction in one atomic transaction |
| Walrus | Cheap verifiable blob storage for agent memory and payloads |
| Balance\<T\> | Trustless escrow without external contracts |

## Module Map

| Module | Move Source | SDK File | Purpose |
|--------|-----------|----------|---------|
| **Agent Identity** | `sui_agent_id.move` | `agent.ts` | On-chain identity registry (ERC-8004 equivalent) |
| **Delegation Policy** | `sui_agent_policy.move` | `policy.ts` | Spending caps & authorization (Google AP2 equivalent) |
| **x402 Payments** | `sui_x402.move` | `x402.ts` | HTTP 402 payment protocol for AI agents |
| **Reputation** | `sui_reputation.move` | `reputation.ts` | Stake-weighted reputation + attestations |
| **Task Market** | `sui_task_market.move` | `task.ts` | On-chain task posting, claiming, fulfillment |
| **Payment Streams** | `sui_stream.move` | `stream.ts` | Epoch-based streaming payments |
| **Agent-to-Agent** | `sui_a2a.move` | `a2a.ts` | Agent messaging protocol (Google A2A equivalent) |
| **Memory** | `sui_memory.move` | `memory.ts` | Walrus-anchored agent memory layer |

## Comparison vs EVM Protocols

| Feature | EVM (x402/ERC-8004/AP2/A2A) | sui-agent-kit |
|---|---|---|
| Agent Identity | ERC-8004 registry contract | First-class owned objects with VecSet capabilities |
| Spending Caps | Google AP2 off-chain auth | On-chain DelegationCap with epoch-based daily limits |
| Payments | x402 via ERC-20 approve/transfer | Coin\<SUI\> in PTBs, atomic escrow via Balance\<T\> |
| Reputation | Off-chain or separate oracle | On-chain stake-weighted score with attestation proofs |
| Task Market | Custom contracts | Shared TaskBoard with capability+reputation gating |
| Streaming | Sablier/Superfluid | Native epoch-based streams with Balance\<SUI\> escrow |
| Messaging | Google A2A HTTP | On-chain AgentMessage objects with payment attachment |
| Memory | External DB / IPFS | Walrus blob + on-chain MemoryAnchor with integrity hash |
| Parallelism | Sequential EVM execution | Sui parallel execution on disjoint objects |
| Atomicity | Multi-contract calls via routers | Single PTB bundles all operations atomically |

## Quick Start

### Prerequisites

- [Sui CLI](https://docs.sui.io/build/install) installed
- Node.js >= 18
- A Sui testnet account with SUI tokens

### 1. Deploy Move Contracts

```bash
cd move
sui move build
sui client publish --gas-budget 500000000
```

Save the package ID from the output.

### 2. Install SDK

```bash
cd sdk
npm install
npm run build
```

### 3. Register an Agent

```typescript
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiAgentKit } from "./sdk/src/index";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const keypair = Ed25519Keypair.fromSecretKey(YOUR_PRIVATE_KEY);
const kit = new SuiAgentKit(client, keypair, PACKAGE_ID);

// Register agent with capabilities
const result = await kit.agents.register({
  registryId: REGISTRY_ID,
  name: "MyAgent",
  capabilities: ["trade", "data", "delegate"],
  endpointBlob: "walrus://my-agent-card",
  x402Support: true,
});
```

### 4. Post and Fulfill a Task

```typescript
// Agent A posts a task
await kit.tasks.post({
  boardId: BOARD_ID,
  title: "Analyze Trading Data",
  descriptionBlob: "walrus://task-desc",
  rewardAmount: 1_000_000_000, // 1 SUI
  requiredCapability: "data",
  minReputationScore: 100,
  deadlineEpoch: 999999,
});

// Agent B claims and fulfills
await kit.tasks.claim(taskId, agentBId, reputationId);
await kit.tasks.fulfill(taskId, agentBId, "walrus://result-blob");

// Agent A accepts → reward released
await kit.tasks.accept(taskId);
```

### 5. Send Agent-to-Agent Message

```typescript
await kit.messages.send({
  agentId: MY_AGENT_ID,
  recipient: OTHER_AGENT_ADDRESS,
  intent: MessageIntent.Request,
  payloadBlob: "walrus://request-payload",
  paymentAmount: 500_000_000, // 0.5 SUI attached
  ttlEpoch: 100,
  requiresAck: true,
});
```

### 6. HTTP 402 Payment Middleware

```typescript
import express from "express";

const app = express();

// Auto-pay 402 requests up to 0.1 SUI
app.use(kit.payments.middleware({ maxAmount: 100_000_000 }));
```

## Project Structure

```
sui-agent-kit/
├── move/
│   ├── Move.toml
│   └── sources/
│       ├── sui_agent_id.move      # Agent identity
│       ├── sui_agent_policy.move  # Delegation policies
│       ├── sui_x402.move          # x402 payments
│       ├── sui_reputation.move    # Reputation system
│       ├── sui_task_market.move   # Task marketplace
│       ├── sui_stream.move        # Payment streams
│       ├── sui_a2a.move           # Agent messaging
│       └── sui_memory.move        # Memory anchoring
├── sdk/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts               # Re-exports everything
│       ├── types.ts               # TypeScript type mirrors
│       ├── client.ts              # SuiAgentKit main class
│       ├── agent.ts               # Agent identity SDK
│       ├── policy.ts              # Delegation policy SDK
│       ├── x402.ts                # x402 payment SDK
│       ├── reputation.ts          # Reputation SDK
│       ├── task.ts                # Task market SDK
│       ├── stream.ts              # Payment stream SDK
│       ├── a2a.ts                 # Agent messaging SDK
│       └── memory.ts              # Memory SDK
├── examples/
│   ├── register-agent/index.ts
│   └── post-and-fulfill-task/index.ts
├── .github/
│   └── copilot-instructions.md
├── LICENSE
└── README.md
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   AI Agent Application               │
├─────────────────────────────────────────────────────┤
│                 TypeScript SDK (sdk/src/)             │
│  SuiAgentKit.agents | .policies | .payments | ...    │
├─────────────────────────────────────────────────────┤
│           Programmable Transaction Blocks (PTBs)      │
├────────┬────────┬────────┬────────┬────────┬────────┤
│Identity│Policy  │x402    │Reputa- │Tasks   │Streams │
│        │        │        │tion    │        │        │
├────────┴────────┴────────┴────────┴────────┴────────┤
│              Sui Blockchain (Move Modules)            │
├─────────────────────────────────────────────────────┤
│         Walrus (Blob Storage) + Ika/MCP (Compute)    │
└─────────────────────────────────────────────────────┘
```

## License

Apache-2.0
