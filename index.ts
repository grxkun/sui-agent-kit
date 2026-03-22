{
  "name": "sui-agent-kit",
  "version": "0.1.0",
  "description": "Open-source middleware framework for agentic economics on the Sui blockchain",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "scripts": {
    "build": "tsup",
    "build:sdk": "cd sdk && tsc",
    "test": "vitest run",
    "lint": "eslint sdk/src/",
    "move:build": "cd move && sui move build",
    "move:test": "cd move && sui move test",
    "clean": "rm -rf dist sdk/dist"
  },
  "dependencies": {
    "@mysten/sui": "^1.0.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "files": ["dist", "sdk/dist", "README.md"],
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/grxkun/sui-agent-kit.git"
  },
  "keywords": [
    "sui",
    "blockchain",
    "ai-agent",
    "agent-kit",
    "move",
    "x402",
    "a2a",
    "defi"
  ]
}
