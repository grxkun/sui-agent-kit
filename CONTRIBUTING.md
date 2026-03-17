# Contributing to sui-agent-kit

First off — thank you. This project exists to fill a real gap in the Sui ecosystem,
and every contribution moves the agentic economy forward.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Move Guidelines](#move-guidelines)
- [TypeScript SDK Guidelines](#typescript-sdk-guidelines)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Module Ownership](#module-ownership)
- [Roadmap & Good First Issues](#roadmap--good-first-issues)

---

## Code of Conduct

Be direct. Be kind. Disagree on ideas, not people.
We're building critical infrastructure — correctness and security matter more than ego.

---

## How to Contribute

### Reporting bugs
Open a GitHub Issue with:
- Which module is affected (`sui_agent_id`, `sui_x402`, etc.)
- Minimal reproduction (Move test or TypeScript snippet)
- Expected vs actual behavior
- Sui CLI version and network (localnet/testnet/mainnet)

### Suggesting new modules
Open a Discussion (not an Issue) titled `[Module Proposal] your_module_name`.
Include: what gap it fills, which EVM standard it replaces or improves on,
and a draft struct layout. We'll discuss before anyone writes code.

### Submitting code
1. Fork the repo
2. Create a branch: `feat/module-name` or `fix/issue-description`
3. Make your changes (see guidelines below)
4. Run all tests locally
5. Open a PR against `main`

---

## Development Setup

### Prerequisites

```bash
# Sui CLI (latest testnet version)
cargo install --locked --git https://github.com/MystenLabs/sui.git \
  --branch testnet sui

# Verify
sui --version

# Node.js 18+
node --version

# pnpm (preferred)
npm install -g pnpm
```

### Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/sui-agent-kit.git
cd sui-agent-kit

# Build Move modules
cd move
sui move build

# Install SDK dependencies
cd ../sdk
pnpm install
pnpm build
```

### Run a local Sui node (for testing)

```bash
sui start --with-faucet --force-regenesis
```

In a new terminal:

```bash
# Fund your test address
sui client faucet

# Publish modules to localnet
cd move
sui client publish --gas-budget 200000000
```

---

## Project Structure

```
sui-agent-kit/
├── move/
│   ├── Move.toml
│   └── sources/
│       ├── sui_agent_id.move       # Module 1 — identity
│       ├── sui_agent_policy.move   # Module 2 — delegation
│       ├── sui_x402.move           # Module 3 — HTTP payments
│       ├── sui_reputation.move     # Module 4 — trust scoring
│       ├── sui_task_market.move    # Module 5 — work marketplace
│       ├── sui_stream.move         # Module 6 — micropayments
│       ├── sui_a2a.move            # Module 7 — agent messaging
│       └── sui_memory.move         # Module 8 — context anchoring
│
├── sdk/
│   ├── src/
│   │   ├── index.ts                # main entry point
│   │   ├── types.ts                # Move struct mirrors
│   │   ├── client.ts               # SuiAgentKit class
│   │   ├── agent.ts                # sui_agent_id SDK
│   │   ├── policy.ts               # sui_agent_policy SDK
│   │   ├── x402.ts                 # sui_x402 + HTTP middleware
│   │   ├── reputation.ts           # sui_reputation SDK
│   │   ├── task.ts                 # sui_task_market SDK
│   │   ├── stream.ts               # sui_stream SDK
│   │   ├── a2a.ts                  # sui_a2a SDK
│   │   └── memory.ts               # sui_memory + Walrus helpers
│   ├── package.json
│   └── tsconfig.json
│
├── examples/
│   ├── register-agent/
│   ├── post-and-fulfill-task/
│   ├── x402-server/
│   └── multi-agent-pipeline/
│
└── docs/
    └── modules/
```

---

## Move Guidelines

### Struct design
```move
// CORRECT — persistent on-chain object
struct MyObject has key, store {
    id: UID,                    // always first field
    owner: address,
    data: String,
}

// CORRECT — temporary capability (passed by value, dropped)
struct MyCap has copy, drop {
    agent_id: ID,
    expires: u64,
}

// WRONG — never use Coin<T> inside a struct
struct Bad has key, store {
    id: UID,
    balance: Coin<SUI>,         // use Balance<SUI> instead
}
```

### Error codes
Every module must define these at the top, in this order:
```move
const E_NOT_OWNER: u64        = 1;
const E_EXPIRED: u64          = 2;
const E_UNAUTHORIZED: u64     = 3;
const E_INSUFFICIENT_FUNDS: u64 = 4;
const E_INVALID_STATE: u64    = 5;
const E_CAPABILITY_MISSING: u64 = 6;
// module-specific codes start at 100
```

### Events
Every state-changing entry function must emit an event:
```move
struct ThingCreated has copy, drop {
    thing_id: ID,
    owner: address,
    timestamp: u64,
}
// inside function:
event::emit(ThingCreated { thing_id: object::id(&thing), owner, timestamp });
```

### Clock usage
Always use `sui::clock::Clock` for timestamps — never `tx_context::epoch` alone:
```move
public entry fun do_thing(clock: &Clock, ctx: &mut TxContext) {
    let now = clock::timestamp_ms(clock);
}
```

### Object sharing
- **Shared objects** for global registries (`AgentRegistry`, `TaskBoard`)
- **Owned objects** for agent-specific state (`AgentCard`, `DelegationCap`)
- **Child objects** for records tightly bound to a parent (`SpendRecord` → `DelegationCap`)

---

## TypeScript SDK Guidelines

### Always use the new SDK
```typescript
// CORRECT
import { SuiClient, Transaction } from '@mysten/sui';

// WRONG — deprecated
import { JsonRpcProvider } from '@mysten/sui.js';
```

### Function signature pattern
```typescript
// Every on-chain call follows this shape
export async function doThing(
  params: DoThingParams,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
): Promise<TransactionResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::module_name::function_name`,
    arguments: [ /* bcs-encoded args */ ],
  });
  return client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true, showObjectChanges: true },
  });
}
```

### Type mirroring
Every Move struct must have a matching TypeScript type in `types.ts`:
```typescript
// mirrors AgentCard has key, store { ... }
export interface AgentCard {
  id: string;           // UID → string
  owner: string;        // address → string
  name: string;
  version: bigint;
  capabilities: string[];
  endpointBlob: string;
  mcpEndpoint: string | null;
  x402Support: boolean;
  active: boolean;
  createdAt: bigint;
}
```

---

## Testing

### Move tests
Every module file includes a `#[test_only]` block. Minimum 3 tests per module:
1. Happy path — normal usage works
2. Authorization failure — wrong owner/expired cap is rejected
3. Edge case — zero amount, empty capability set, expired deadline, etc.

```bash
# Run all Move tests
cd move && sui move test

# Run tests for a specific module
sui move test --filter sui_agent_id
```

### TypeScript tests
We use **vitest** against a local Sui node:

```bash
cd sdk

# Start localnet first (separate terminal)
sui start --with-faucet --force-regenesis

# Run tests
pnpm test

# Watch mode
pnpm test:watch
```

### CI
Every PR triggers `.github/workflows/test.yml` which:
1. Runs `sui move build` and `sui move test`
2. Runs `pnpm build` and `pnpm test` on the SDK
3. Checks formatting with `prettier` and `sui move lint`

PRs cannot be merged if CI is red.

---

## Pull Request Process

1. **One PR per module or fix** — don't bundle unrelated changes
2. **Title format:** `feat(sui_x402): add fulfill_request entry function`
   or `fix(sui_stream): correct epoch overflow in claim()`
3. **PR description must include:**
   - What changed and why
   - Which issue it closes (`Closes #42`)
   - Test output (`sui move test` passing screenshot or paste)
   - Any breaking changes to existing struct layouts
4. **Struct changes are breaking** — if you add/remove fields from a published
   struct, open a Discussion first. On-chain data migration must be planned.
5. **Two approvals** required for Move module changes
6. **One approval** sufficient for SDK-only or docs changes

---

## Module Ownership

| Module | Status | Lead |
|---|---|---|
| `sui_agent_id` | 🟡 In progress | open |
| `sui_agent_policy` | 🟡 In progress | open |
| `sui_x402` | 🟡 In progress | open |
| `sui_reputation` | 🔴 Not started | open |
| `sui_task_market` | 🔴 Not started | open |
| `sui_stream` | 🔴 Not started | open |
| `sui_a2a` | 🔴 Not started | open |
| `sui_memory` | 🔴 Not started | open |

If you want to own a module, comment on its tracking issue.

---

## Roadmap & Good First Issues

### Good first issues (no Move experience needed)
- [ ] Add JSDoc comments to all SDK functions
- [ ] Write usage examples for `examples/register-agent/`
- [ ] Add `getOpenTasks()` pagination to `task.ts`
- [ ] Write `docs/modules/agent-id.md`
- [ ] Add Walrus upload helper to `memory.ts`

### Good first Move issues (Move experience helpful)
- [ ] Add `has_capability()` view function to `sui_agent_id`
- [ ] Write 3 test cases for `sui_agent_policy` expiry logic
- [ ] Implement `reclaim_expired()` in `sui_a2a`

### Core module issues
See GitHub Issues labeled `module` for full implementation tasks.

---

## Questions?

Open a GitHub Discussion or reach out in the Sui Discord (`#developer-chat`).

---

Built with care for the Sui ecosystem. Apache 2.0.
