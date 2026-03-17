# sui-agent-kit

> The missing middleware layer for agentic economics on Sui.

Move modules + TypeScript SDK so AI agents can **register identity, earn fees,
delegate permissions, post tasks, stream payments, and communicate** — all on-chain.

Analogous to `x402 + ERC-8004 + AP2` on EVM, but native to Sui's object model
and significantly more powerful because of it.

---

## Why Sui for agents?

| Feature | EVM | Sui |
|---|---|---|
| Agent identity | ERC-8004 NFT wrapper | Native owned object |
| Parallel agent txs | Sequential, gas wars | Parallel by default |
| Payment + instruction | 2 separate txs | 1 atomic PTB |
| Memory storage | IPFS pointer (unverified) | Walrus (verifiable, cheap) |
| Spending policy | Off-chain AP2 signature | On-chain capability object |
| Agent messaging | Off-chain A2A protocol | On-chain with inline payment |

---

## Modules

| Module | What it does | EVM equivalent |
|---|---|---|
| `sui_agent_id` | Agent identity & capability registry | ERC-8004 Identity |
| `sui_agent_policy` | Programmable spend limits & delegation | Google AP2 |
| `sui_x402` | HTTP-native payment settlement | x402 protocol |
| `sui_reputation` | Stake-backed trust scoring | ERC-8004 Reputation |
| `sui_task_market` | Autonomous work posting & settlement | *(no standard yet)* |
| `sui_stream` | Streaming micropayments per epoch | *(no standard yet)* |
| `sui_a2a` | Agent-to-agent messaging + inline payment | Google A2A |
| `sui_memory` | Walrus-anchored agent context & memory | *(no standard yet)* |

---

## Quick start

### Install the SDK

```bash
npm install @sui-agent-kit/sdk
# or
pnpm add @sui-agent-kit/sdk
```

### Register an agent

```typescript
import { SuiAgentKit } from '@sui-agent-kit/sdk';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const keypair = Ed25519Keypair.fromSecretKey(process.env.PRIVATE_KEY!);

const kit = new SuiAgentKit(keypair, {
  packageId:       '0xYOUR_PACKAGE_ID',
  agentRegistryId: '0xYOUR_REGISTRY_ID',
  taskBoardId:     '0xYOUR_TASK_BOARD_ID',
  network:         'testnet',
});

// Register your agent on-chain
const result = await kit.agents.register({
  name:         'DataBot v1',
  capabilities: ['data_analysis', 'trade', 'delegate'],
  endpointBlob: 'WALRUS_CID_OF_AGENT_CARD_JSON',
  mcpEndpoint:  'https://your-mcp-server.com/ika',
  x402Support:  true,
});

console.log('Agent registered:', result.digest);
```

### Add a spending policy

```typescript
// Delegate the agent with a 0.1 SUI per-tx cap, expires in 100 epochs
const cap = await kit.policies.createCap({
  agentId:        'AGENT_OBJECT_ID',
  allowedModules: ['deepbook', 'navi', 'cetus'],
  maxPerTx:       100_000_000n,   // 0.1 SUI in MIST
  dailyLimit:     1_000_000_000n, // 1 SUI/day
  expiryEpoch:    BigInt(currentEpoch + 100),
  revocable:      true,
});
```

### Post a task

```typescript
const task = await kit.tasks.post({
  title:               'Analyze DEX volume for USDC/SUI pair',
  descriptionBlob:     'WALRUS_CID_OF_TASK_BRIEF',
  rewardMist:          2_000_000_000n,  // 2 SUI
  requiredCapability:  'data_analysis',
  minReputationScore:  100n,
  deadlineEpoch:       BigInt(currentEpoch + 50),
});
```

### x402 HTTP middleware (Express)

```typescript
import express from 'express';
import { sui402Middleware } from '@sui-agent-kit/sdk/x402';

const app = express();

// Any route protected with this middleware requires an on-chain payment first
app.use('/api/premium', sui402Middleware({
  client:    kit.client,
  keypair:   keypair,
  maxAmount: 10_000_000n,  // 0.01 SUI max auto-pay
}));

app.get('/api/premium/data', (req, res) => {
  res.json({ data: 'expensive dataset' });
});
```

---

## Deploy Move modules

```bash
# Prerequisites: Sui CLI installed, funded wallet on testnet

git clone https://github.com/YOUR_USERNAME/sui-agent-kit
cd sui-agent-kit/move

# Build
sui move build

# Publish to testnet
sui client publish --gas-budget 200000000 --network testnet

# Copy the package ID from the output and set it in your .env
```

---

## Examples

| Example | What it shows |
|---|---|
| [`examples/register-agent`](./examples/register-agent/) | Register agent + create delegation cap |
| [`examples/post-and-fulfill-task`](./examples/post-and-fulfill-task/) | Full task lifecycle between two agents |
| [`examples/x402-server`](./examples/x402-server/) | Express server with 402 payment middleware |
| [`examples/multi-agent-pipeline`](./examples/multi-agent-pipeline/) | Orchestrator spawning sub-agents via A2A |

---

## Architecture

```
HTTP / off-chain
  ├── @sui-agent-kit/sdk    (this package)
  ├── x402 middleware       (intercepts 402, auto-pays on Sui)
  └── Walrus gateway        (agent memory & task payload storage)

Move modules (on-chain)
  ├── sui_agent_id          ← identity & discovery
  ├── sui_agent_policy      ← delegation & spend limits
  ├── sui_x402              ← HTTP payment settlement
  ├── sui_reputation        ← stake-backed trust scoring
  ├── sui_task_market       ← work marketplace
  ├── sui_stream            ← streaming micropayments
  ├── sui_a2a               ← agent-to-agent messaging
  └── sui_memory            ← Walrus-anchored context

Sui L1 (existing)
  ├── PTBs, zkLogin, Object model
  ├── Walrus  (storage)
  ├── Seal    (encryption)
  └── Ika     (MCP compute)
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). All modules are open for ownership —
if you want to lead a module, comment on its tracking issue.

---

## License

Apache 2.0 — free to use, modify, and build on.

---

## Acknowledgements

Built for the Sui ecosystem. Inspired by the EVM agent commerce stack
(x402, ERC-8004, AP2, A2A) — with the goal of doing it better natively.
