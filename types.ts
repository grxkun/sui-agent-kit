{
  "name": "@sui-agent-kit/sdk",
  "version": "0.1.0",
  "description": "TypeScript SDK for sui-agent-kit — agentic economics on Sui",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint src/",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@mysten/sui": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "files": ["dist", "README.md"],
  "license": "Apache-2.0",
  "publishConfig": { "access": "public" }
}
