# Contributing

Thanks for considering a contribution to sui-agent-kit.

---

## Setup

```bash
git clone https://github.com/grxkun/sui-agent-kit.git
cd sui-agent-kit
npm install
```

You'll also need the [Sui CLI](https://docs.sui.io/build/install) to build and test Move contracts.

---

## Building

Move contracts:

```bash
cd move
sui move build
sui move test
```

TypeScript SDK:

```bash
cd sdk
npm run build
```

---

## How the repo is structured

The project has two layers that stay in sync:

- `move/sources/*.move` — 8 Move modules deployed as a single package to Sui.
- `sdk/src/*.ts` — TypeScript SDK with one file per module, plus a unified `SuiAgentKit` class in `client.ts`.
- `sdk/src/types.ts` — mirrors every Move struct. When you add a field to a Move struct, add the corresponding TypeScript type here.

Each SDK module file (`agent.ts`, `policy.ts`, etc.) exports free functions. The `client.ts` class re-exposes them as `kit.agents.*`, `kit.policies.*`, etc.

---

## Conventions

**Move:**
- All modules live under the `sui_agent_kit` address.
- Error codes as constants at the top: `const E_NOT_OWNER: u64 = 0;`
- Emit an event for every state mutation.
- Use `Balance<SUI>` for escrow, `VecSet` for capability sets.
- snake_case for module and function names, PascalCase for struct names.

**TypeScript:**
- Use `bigint` for all `u64` fields from Move.
- Every public SDK function takes `(params, signer, client, packageId)` — the `SuiAgentKit` class wires these automatically.
- Imports use `.js` extensions for ESM compatibility.

---

## Making a change

1. Create a branch off `main`: `git checkout -b feat/your-feature`
2. If adding a new Move module, also add the corresponding SDK file and wire it into `client.ts` and `index.ts`.
3. If modifying a Move struct, update `types.ts` to match.
4. Test your Move changes: `cd move && sui move test`
5. Open a PR against `main`. One feature per PR.

---

## What makes a good PR

- Small and focused. If you're adding a new module and fixing a bug, that's two PRs.
- Includes Move tests for any new contract logic.
- Updates the README module table if adding a new module.
- Doesn't break existing SDK function signatures without a migration note.

---

## Reporting issues

Open a GitHub issue. Include:
- What you expected to happen
- What actually happened
- Steps to reproduce (testnet tx digests are helpful)

---

## License

By contributing, you agree that your contributions will be licensed under the MIT license.
