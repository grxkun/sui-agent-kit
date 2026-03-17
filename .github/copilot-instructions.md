# Sui Agent Kit — Copilot Instructions

You are an expert Sui Move developer and TypeScript engineer building
**sui-agent-kit** — an open-source middleware framework for agentic economics
on the Sui blockchain.

## Project Purpose

This is the missing composable module layer between Sui's L1 primitives and
real-world AI agent applications, analogous to x402 + ERC-8004 + Google AP2
on EVM — but native to Sui's object model.

### Sui Advantages We Exploit

- Every agent, task, policy, and message is a first-class owned object (`has key, store`)
- Parallel execution: agents on disjoint state never block each other
- PTBs (Programmable Transaction Blocks): payment + instruction in one atomic tx
- Walrus: cheap verifiable blob storage for agent memory and task payloads
- Ika/MCP: off-chain compute with on-chain verification
- `Balance<T>` inside objects = trustless escrow without external contracts

### EVM Protocols We Must Be Compatible With or Outcompete

| Protocol | Description | Our Equivalent |
|---|---|---|
| x402 (Coinbase/Cloudflare) | HTTP 402 payment protocol for AI agents | `sui_x402` module |
| ERC-8004 | On-chain identity + reputation registry | `sui_agent_id` + `sui_reputation` |
| Google AP2 | Authorization protocol for agent spending | `sui_agent_policy` |
| Google A2A | Agent-to-agent communication protocol | `sui_a2a` |

---

## Strict Coding Conventions — Follow Exactly

### Move

- Sui Move edition `2024.beta`
- Persistent objects: `has key, store` — always with `id: UID` as first field
- Temporary values: `has copy, drop`
- Use `Balance<T>` inside structs, `Coin<T>` only in function parameters
- Use `VecSet<String>` for capability/permission sets
- All timestamps via `sui::clock::Clock` object — never `tx_context` alone
- Emit `sui::event::emit()` for every meaningful state change
- Error constants:
  ```move
  const E_NOT_OWNER: u64 = 1;
  const E_EXPIRED: u64 = 2;
  const E_UNAUTHORIZED: u64 = 3;
  const E_INSUFFICIENT_FUNDS: u64 = 4;
  const E_INVALID_STATE: u64 = 5;
  const E_CAPABILITY_MISSING: u64 = 6;
  ```
- Every module has a `#[test_only]` section with at least 3 tests
- Use `object::new(ctx)` for UID, `transfer::transfer()` or `transfer::share_object()`
- Shared objects for global registries, owned objects for agent-specific state

### TypeScript SDK

- Package: `@mysten/sui` (NOT deprecated `@mysten/sui.js`)
- Use `Transaction` (PTB builder) for all on-chain calls
- Every Move struct mirrored as a TypeScript type in `types.ts`
- Functions return `Promise<TransactionResult>` or `Promise<T | null>`
- Use `bcs` for argument encoding
- Export everything from `index.ts`

---

## Module Architecture

| # | Move Module | SDK File | Purpose |
|---|---|---|---|
| 1 | `sui_agent_id` | `agent.ts` | Agent identity registry (ERC-8004 analogue) |
| 2 | `sui_agent_policy` | `policy.ts` | Delegation caps + spend policies (AP2 analogue) |
| 3 | `sui_x402` | `x402.ts` | HTTP 402 payment protocol (x402 analogue) |
| 4 | `sui_reputation` | `reputation.ts` | Stake-weighted reputation + attestations |
| 5 | `sui_task_market` | `task.ts` | On-chain task bounty marketplace |
| 6 | `sui_stream` | `stream.ts` | Epoch-based continuous payment streams |
| 7 | `sui_a2a` | `a2a.ts` | Agent-to-agent messaging (A2A analogue) |
| 8 | `sui_memory` | `memory.ts` | Verifiable memory anchors on Walrus |

---

## Directory Structure

```
sui-agent-kit/
├── move/
│   ├── Move.toml
│   └── sources/
│       ├── sui_agent_id.move
│       ├── sui_agent_policy.move
│       ├── sui_x402.move
│       ├── sui_reputation.move
│       ├── sui_task_market.move
│       ├── sui_stream.move
│       ├── sui_a2a.move
│       └── sui_memory.move
├── sdk/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── types.ts
│       ├── client.ts
│       ├── agent.ts
│       ├── policy.ts
│       ├── x402.ts
│       ├── reputation.ts
│       ├── task.ts
│       ├── stream.ts
│       ├── a2a.ts
│       └── memory.ts
└── examples/
    ├── register-agent/index.ts
    └── post-and-fulfill-task/index.ts
```

---

## Key Design Decisions

1. **Shared vs Owned Objects**: `AgentRegistry` and `TaskBoard` are shared (global discovery). All agent state is owned.
2. **Balance inside objects**: Rewards, streams, and message payments use `Balance<SUI>` not `Coin<SUI>` to enable trustless escrow without extra contracts.
3. **PTB atomicity**: SDK always builds a single `Transaction` per operation so payment + action are atomic.
4. **Walrus for blobs**: All large payloads (task descriptions, results, messages, memories) are stored off-chain on Walrus; only content IDs (CIDs) are stored on-chain.
5. **Epoch-based timing**: Streams and caps use `epoch` for time-bucketing; absolute ms timestamps (from `Clock`) for expiry.
