# sui-agent-kit

The missing middleware layer between Sui's L1 primitives and real-world AI agent applications.

Eight composable Move modules and a unified TypeScript SDK that give agents economic agency on-chain: identity, delegation, payments, reputation, task markets, streaming, messaging, and memory.

---

## The idea

On EVM, agent infrastructure is scattered across disconnected protocols — x402 for payments, ERC-8004 for identity, Google AP2 for delegation, A2A for messaging. Each lives in its own repo, its own runtime, its own trust model.

sui-agent-kit consolidates all of this into a single package deployed to Sui. Every agent, task, policy, and message is a first-class Sui object. Every operation — payment, delegation check, task assignment — composes inside a single Programmable Transaction Block. No routers, no multi-contract hops, no sequential bottlenecks.

The canonical flow:

```
register → delegate → authorize → execute → attest → settle
```

---

## Modules

```
move/sources/
  sui_agent_id.move         Identity registry. VecSet capabilities, Walrus endpoint.
  sui_agent_policy.move     DelegationCap with per-tx limits, daily budgets, epoch expiry.
  sui_x402.move             HTTP 402 payment requests. Atomic fulfill, frozen receipts.
  sui_reputation.move       Stake-weighted scoring. Attestation proofs between agents.
  sui_task_market.move      Shared TaskBoard. Escrow via Balance<SUI>, reputation gating.
  sui_stream.move           Epoch-based streaming payments. Open, claim, top-up, close.
  sui_a2a.move              Agent-to-agent messages with attached SUI payment and TTL.
  sui_memory.move           Walrus-anchored memory. Content hash verification on-chain.
```

```
sdk/src/
  client.ts                 SuiAgentKit — unified entry point.
  agent.ts                  kit.agents.register() / .get() / .hasCapability()
  policy.ts                 kit.policies.createCap() / .revoke() / .checkAuthorization()
  x402.ts                   kit.payments.createRequest() / .fulfill() / .middleware()
  reputation.ts             kit.reputation.init() / .attest() / .getScore()
  task.ts                   kit.tasks.post() / .claim() / .fulfill() / .accept()
  stream.ts                 kit.streams.open() / .claim() / .topUp() / .close()
  a2a.ts                    kit.messages.send() / .acknowledge() / .getInbox()
  memory.ts                 kit.memory.store() / .get() / .verify() / .uploadToWalrus()
```

---

## Why Sui and not EVM

Sui objects are owned or shared — agents on disjoint state execute in parallel. `Balance<SUI>` gives you trustless escrow without a separate vault contract. PTBs bundle an entire workflow atomically: split coin, check policy, post task, attach payment, emit event — one transaction, one gas fee.

Walrus handles the heavy payloads. Move handles the trust. The SDK handles the wiring.

---

## Get started

Deploy the contracts:

```bash
cd move && sui move build && sui client publish --gas-budget 500000000
```

Build the SDK:

```bash
cd sdk && npm install && npm run build
```

Register an agent:

```ts
import { SuiAgentKit } from "./sdk/src/index";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const kit = new SuiAgentKit(keypair, {
  packageId: "0x...",
  agentRegistryId: "0x...",
  taskBoardId: "0x...",
  network: "testnet",
});

await kit.agents.register({
  name: "TraderBot",
  capabilities: ["trade", "data", "delegate"],
  endpointBlob: "walrus://agent-card",
  x402Support: true,
});
```

Post a task, fulfill it, settle:

```ts
await kit.tasks.post({
  title: "Analyze order flow",
  descriptionBlob: "walrus://task-spec",
  rewardMist: 1_000_000_000n,
  requiredCapability: "data",
  deadlineEpoch: 999999n,
});

await kit.tasks.claim(taskId, agentId, reputationId);
await kit.tasks.fulfill(taskId, "walrus://result");
await kit.tasks.accept(taskId); // releases escrow
```

Send a paid message between agents:

```ts
await kit.messages.send({
  senderAgentCardId: myAgentId,
  recipient: otherAgent,
  intent: MessageIntent.Request,
  payloadBlob: "walrus://payload",
  paymentMist: 500_000_000n,
  ttlEpoch: 100n,
  requiresAck: true,
});
```

---

## EVM equivalence

| Concern | EVM | sui-agent-kit |
|---|---|---|
| Identity | ERC-8004 registry | `AgentCard` owned objects, `VecSet` capabilities |
| Delegation | AP2 off-chain auth | `DelegationCap` with on-chain epoch budgets |
| Payments | x402 + ERC-20 approve | `Coin<SUI>` in PTBs, `Balance<T>` escrow |
| Reputation | Off-chain oracles | Stake-weighted `ReputationRecord` + frozen `Attestation` |
| Tasks | Custom contracts | `TaskBoard` shared object, escrow + gating |
| Streaming | Sablier / Superfluid | `PaymentStream` with epoch-rate claims |
| Messaging | A2A over HTTP | `AgentMessage` objects with payment + TTL |
| Memory | IPFS + external DB | Walrus blob + `MemoryAnchor` hash verification |

---

## Project structure

```
move/sources/         8 Move modules — the on-chain layer
sdk/src/              TypeScript SDK — wraps every module
examples/             Working examples for testnet
.github/              Copilot instructions, CI
```

---

## License

MIT
