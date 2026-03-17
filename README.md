# sui-agent-kit

> Open-source middleware framework for agentic economics on the Sui blockchain.
> The missing composable module layer between Sui's L1 primitives and real-world AI agent applications — analogous to x402 + ERC-8004 + Google AP2 on EVM, but **native to Sui's object model**.

---

## Module Table

| # | Move Module | SDK File | Description |
|---|---|---|---|
| 1 | `sui_agent_id` | `agent.ts` | Agent identity registry — every agent is a first-class owned `AgentCard` object |
| 2 | `sui_agent_policy` | `policy.ts` | Delegation caps & spend policies — mirrors Google AP2 authorization semantics |
| 3 | `sui_x402` | `x402.ts` | HTTP 402 payment protocol — native Sui implementation of Coinbase/Cloudflare x402 |
| 4 | `sui_reputation` | `reputation.ts` | Stake-weighted reputation + peer attestations — ERC-8004 analogue |
| 5 | `sui_task_market` | `task.ts` | On-chain bounty task marketplace with escrow rewards |
| 6 | `sui_stream` | `stream.ts` | Epoch-based continuous payment streams |
| 7 | `sui_a2a` | `a2a.ts` | Agent-to-agent messaging with optional SUI payment — Google A2A analogue |
| 8 | `sui_memory` | `memory.ts` | Verifiable on-chain memory anchors backed by Walrus blob storage |

---

## Quick Start

### Prerequisites

- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) ≥ 1.x
- Node.js ≥ 20
- A funded testnet wallet (`sui client faucet`)

### 1. Deploy Move Package

```bash
cd move
sui move build
sui client publish --gas-budget 200000000
```

Save the published `PACKAGE_ID`, the shared `AgentRegistry` object ID (`REGISTRY_ID`),
and the shared `TaskBoard` ID (`TASK_BOARD_ID`) from the output.

### 2. Install SDK

```bash
cd sdk
npm install
npm run build
```

### 3. Register an Agent

```bash
PRIVATE_KEY=<base64-key> \
PACKAGE_ID=0x... \
REGISTRY_ID=0x... \
npx ts-node examples/register-agent/index.ts
```

### 4. Post & Fulfill a Task

```bash
PACKAGE_ID=0x... \
REGISTRY_ID=0x... \
TASK_BOARD_ID=0x... \
AGENT_A_KEY=<base64> \
AGENT_B_KEY=<base64> \
AGENT_B_CARD_ID=0x... \
AGENT_B_REP_ID=0x... \
npx ts-node examples/post-and-fulfill-task/index.ts
```

### 5. SDK Usage

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiAgentKit } from "./sdk/src/index.js";

const client = new SuiClient({ url: getFullnodeUrl("testnet") });
const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(process.env.PRIVATE_KEY!, "base64"));

const kit = new SuiAgentKit(client, keypair, PACKAGE_ID, {
  registryId: REGISTRY_ID,
  taskBoardId: TASK_BOARD_ID,
  clockId: "0x6",
});

// Register an agent
const tx = await kit.agents.register({
  name: "MyAgent",
  capabilities: ["trade", "data"],
  endpointBlob: "bafybei...",
  x402Support: true,
});

// Post a task
await kit.tasks.post({
  title: "Analyse data",
  descriptionBlob: "bafybei...",
  rewardMist: 1_000_000_000n,
  requiredCapability: "data",
  minReputationScore: 100n,
  deadlineEpoch: 9999n,
});

// Open a payment stream
await kit.streams.open({
  payee: "0xrecipient...",
  ratePerEpoch: 100_000_000n,
  initialDepositMist: 10_000_000_000n,
});
```

---

## Comparison: Sui Agent Kit vs EVM Protocols

| Feature | EVM Protocol | Sui Agent Kit |
|---|---|---|
| Agent identity | ERC-8004 (on-chain registry mapping) | `AgentCard` — first-class owned object with `has key, store` |
| Spending policy | Google AP2 (capability tokens) | `DelegationCap` — scoped module whitelist + per-tx + daily limits |
| HTTP payment | x402 (Coinbase, Cloudflare) | `sui_x402` — `PaymentRequest` + `Receipt` objects + Express middleware |
| Reputation | ERC-8004 registry score | Stake-weighted `ReputationRecord` + peer `Attestation` objects |
| Task marketplace | Custom escrow contracts | `Task` with `Balance<SUI>` escrow, shared `TaskBoard` registry |
| Streaming payments | Superfluid / Sablier | Epoch-based `PaymentStream` with `Balance<SUI>` inside |
| Agent messaging | Google A2A | `AgentMessage` owned by recipient, with attached `Balance<SUI>` |
| Memory / storage | IPFS CID in events | `MemoryAnchor` on-chain + Walrus blob, SHA-256 integrity check |

### Key Sui Advantages Over EVM

- **Parallel execution** — agents on disjoint state never contend
- **Owned objects** — no shared-state bottlenecks for per-agent data
- **PTB atomicity** — payment + task claim in a single transaction
- **Walrus** — cheap, verifiable blob storage native to the Sui ecosystem
- **Balance inside objects** — trustless escrow without extra contracts

---

## Repository Structure

```
sui-agent-kit/
├── move/                   Sui Move package
│   ├── Move.toml
│   └── sources/            8 Move modules
├── sdk/                    TypeScript SDK
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts        Re-exports everything
│       ├── types.ts        TypeScript mirrors of all Move structs
│       ├── client.ts       SuiAgentKit unified client class
│       └── *.ts            One file per module
└── examples/
    ├── register-agent/
    └── post-and-fulfill-task/
```

---

## License

MIT

