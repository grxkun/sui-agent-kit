# Contributing to sui-agent-kit

Thanks for your interest in contributing!

## Development Setup

1. Install dependencies: `npm install`
2. Install Sui CLI: https://docs.sui.io/build/install
3. Build Move contracts: `cd move && sui move build`
4. Build SDK: `npm run build`

## Project Structure

```
move/sources/     → Move smart contracts (8 modules)
sdk/src/          → TypeScript SDK
examples/         → Usage examples
```

## Guidelines

- **Move**: Follow existing patterns — error constants, events on every mutation, Balance<T> for escrow
- **SDK**: Mirror Move structs in types.ts, use bigint for u64 fields
- **Tests**: Add Move tests for new contract logic, vitest for SDK
- **PRs**: One feature per PR, include tests, update README if adding a module

## Move Testing

```bash
cd move
sui move test
```

## SDK Testing

```bash
npm test
```

## Code Style

- TypeScript: strict mode, ESM imports
- Move: snake_case modules, PascalCase structs

## License

By contributing, you agree that your contributions will be licensed under Apache-2.0.
