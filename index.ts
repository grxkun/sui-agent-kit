/**
 * sui-agent-kit utilities
 *
 * Import these alongside the core SDK:
 * ```ts
 * import { retryWithBackoff, estimateGas, EventSubscriber } from "@grxkun/sui-agent-kit/utils";
 * ```
 */

// Error handling & retry
export {
  retryWithBackoff,
  classifyError,
  isRetryable,
  SuiAgentError,
  InsufficientGasError,
  NetworkError,
  TransactionFailedError,
  ObjectNotFoundError,
  type RetryOptions,
} from "./retry";

// Gas estimation
export {
  estimateGas,
  applyGasBudget,
  mistToSui,
  formatGasEstimate,
  type GasEstimate,
  type EstimateOptions,
} from "./gas";

// Input validation
export {
  validate,
  SuiAddress,
  ObjectId,
  PackageId,
  RegisterAgentSchema,
  CreateDelegationSchema,
  PostTaskSchema,
  ClaimTaskSchema,
  FulfillTaskSchema,
  UpdateReputationSchema,
  StreamPaymentSchema,
  StoreMemorySchema,
  SendMessageSchema,
  type RegisterAgentParams,
  type CreateDelegationParams,
  type PostTaskParams,
  type ClaimTaskParams,
  type FulfillTaskParams,
  type UpdateReputationParams,
  type StreamPaymentParams,
  type StoreMemoryParams,
  type SendMessageParams,
} from "./validation";

// Event subscriptions
export {
  EventSubscriber,
  createEventHelpers,
  type EventFilter,
  type EventHandler,
  type SubscriptionOptions,
} from "./events";

// Transaction batching
export {
  BatchBuilder,
  batchClaimTasks,
  batchSendMessages,
  type MoveCallSpec,
  type BatchOptions,
} from "./batch";
