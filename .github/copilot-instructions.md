# sui-agent-kit Copilot Instructions

## Project Overview
sui-agent-kit is an open-source middleware framework for agentic economics on the Sui blockchain.
It provides composable modules for agent identity, delegation policies, payments (x402), reputation,
task markets, payment streams, agent-to-agent messaging, and on-chain memory anchoring.

## Architecture
- **Move contracts** in `move/sources/` — 8 modules forming the on-chain layer
- **TypeScript SDK** in `sdk/src/` — mirrors every Move struct and exposes async functions
- **Examples** in `examples/` — working integration scripts

## Move Conventions
- Edition: Sui Move 2024.beta
- Persistent objects use `has key, store` with `id: UID` as first field
- Temporary values use `has copy, drop`
- Use `Balance<T>` inside structs, `Coin<T>` only in function parameters
- Use `VecSet<String>` for capability/permission sets
- All timestamps via `sui::clock::Clock` object
- Emit `sui::event::emit()` for every meaningful state change
- Error constants: `E_NOT_OWNER=1, E_EXPIRED=2, E_UNAUTHORIZED=3, E_INSUFFICIENT_FUNDS=4, E_INVALID_STATE=5, E_CAPABILITY_MISSING=6`
- Every module has `#[test_only]` section with at least 3 tests
- Shared objects for global registries, owned objects for agent-specific state

## TypeScript SDK Conventions
- Package: `@mysten/sui` (NOT deprecated `@mysten/sui.js`)
- Use `Transaction` (PTB builder) for all on-chain calls
- Every Move struct mirrored as a TypeScript type in `types.ts`
- Functions return `Promise<TransactionResult>` or `Promise<T | null>`
- Export everything from `index.ts`
- Clock object ID: `"0x6"`

## Module Map
| Module | Move File | SDK File | Purpose |
|--------|-----------|----------|---------|
| Agent Identity | `sui_agent_id.move` | `agent.ts` | ERC-8004 equivalent identity registry |
| Delegation Policy | `sui_agent_policy.move` | `policy.ts` | Google AP2 equivalent spending caps |
| x402 Payments | `sui_x402.move` | `x402.ts` | HTTP 402 payment protocol for AI agents |
| Reputation | `sui_reputation.move` | `reputation.ts` | Stake-weighted reputation + attestations |
| Task Market | `sui_task_market.move` | `task.ts` | On-chain task posting, claiming, fulfillment |
| Payment Streams | `sui_stream.move` | `stream.ts` | Epoch-based streaming payments |
| Agent-to-Agent | `sui_a2a.move` | `a2a.ts` | Google A2A equivalent messaging |
| Memory | `sui_memory.move` | `memory.ts` | Walrus-anchored agent memory layer |

## Adding New Modules
1. Create Move source in `move/sources/`
2. Create SDK wrapper in `sdk/src/`
3. Add types to `sdk/src/types.ts`
4. Add module to `SuiAgentKit` class in `sdk/src/client.ts`
5. Re-export from `sdk/src/index.ts`
6. Write at least 3 Move tests using `sui::test_scenario`
