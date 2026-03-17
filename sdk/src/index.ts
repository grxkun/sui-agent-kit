// ═══════════════════════════════════════════════
// sui-agent-kit SDK — main entry point
// ═══════════════════════════════════════════════

export { SuiAgentKit } from "./client";

// Module-level exports
export {
  registerAgent,
  getAgent,
  hasCapability,
  listAgentsByOwner,
} from "./agent";

export {
  createDelegationCap,
  revokeCap,
  getCap,
  checkAuthorization,
} from "./policy";

export {
  createPaymentRequest,
  fulfillRequest,
  verifyReceipt,
  sui402Middleware,
} from "./x402";

export {
  initReputation,
  addStake,
  getReputation,
  getReputationByAgent,
} from "./reputation";

export {
  postTask,
  claimTask,
  fulfillTask,
  acceptResult,
  getOpenTasks,
  getTasksByAgent,
} from "./task";

export {
  openStream,
  claimStream,
  topUp,
  closeStream,
  getStreamBalance,
  getStream,
} from "./stream";

export {
  sendMessage,
  acknowledgeMessage,
  rejectMessage,
  getInbox,
  getPendingAcks,
} from "./a2a";

export {
  storeMemory,
  getMemory,
  listAgentMemory,
  verifyMemoryIntegrity,
  uploadToWalrus,
} from "./memory";

// Type exports
export type {
  AgentCard,
  AgentRegistry,
  DelegationCap,
  SpendRecord,
  PaymentRequest,
  Receipt,
  ReputationRecord,
  Attestation,
  Task,
  TaskBoard,
  PaymentStream,
  AgentMessage,
  MemoryAnchor,
  MemoryIndex,
  TransactionResult,
  RegisterAgentParams,
  CreateDelegationCapParams,
  CreatePaymentRequestParams,
  PostTaskParams,
  OpenStreamParams,
  SendMessageParams,
  StoreMemoryParams,
} from "./types";

export { TaskStatus, MessageIntent, MemoryType } from "./types";
