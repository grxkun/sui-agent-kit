// ─────────────────────────────────────────────────────────────────────────────
// index.ts — Re-exports everything from sui-agent-kit SDK
// ─────────────────────────────────────────────────────────────────────────────

export { SuiAgentKit } from './client.js';

// Types
export type {
  AgentCard,
  AgentRegistry,
  RegisterAgentParams,
  DelegationCap,
  SpendRecord,
  CreateDelegationCapParams,
  PaymentRequest,
  Receipt,
  CreatePaymentRequestParams,
  ReputationRecord,
  Attestation,
  AttestParams,
  Task,
  TaskBoard,
  PostTaskParams,
  PaymentStream,
  OpenStreamParams,
  AgentMessage,
  SendMessageParams,
  MemoryAnchor,
  MemoryIndex,
  StoreMemoryParams,
  SuiAgentKitConfig,
} from './types.js';

export { TaskStatus, MessageIntent, MemoryType } from './types.js';

// Module functions (for advanced usage without the unified kit)
export * as AgentModule from './agent.js';
export * as PolicyModule from './policy.js';
export * as X402Module from './x402.js';
export * as ReputationModule from './reputation.js';
export * as TaskModule from './task.js';
export * as StreamModule from './stream.js';
export * as A2AModule from './a2a.js';
export * as MemoryModule from './memory.js';
