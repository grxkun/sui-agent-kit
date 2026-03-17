/**
 * index.ts — public SDK surface: re-exports everything.
 */

// Types
export * from "./types.js";

// Module 1 — Agent Identity
export * from "./agent.js";

// Module 2 — Delegation Policy
export * from "./policy.js";

// Module 3 — x402 Payments
export * from "./x402.js";

// Module 4 — Reputation
export * from "./reputation.js";

// Module 5 — Task Market
export * from "./task.js";

// Module 6 — Payment Streams
export * from "./stream.js";

// Module 7 — A2A Messaging
export * from "./a2a.js";

// Module 8 — Memory
export * from "./memory.js";

// Unified client
export { SuiAgentKit } from "./client.js";
export type { SuiAgentKitConfig } from "./client.js";
