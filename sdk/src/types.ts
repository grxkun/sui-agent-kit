// ═══════════════════════════════════════════════
// TypeScript mirror types for all 8 Move modules
// ═══════════════════════════════════════════════

// ───────────────────────────────────────────────
// Module 1: sui_agent_id
// ───────────────────────────────────────────────

export interface AgentCard {
  id: string;
  owner: string;
  name: string;
  version: number;
  capabilities: string[];
  endpointBlob: string;
  mcpEndpoint: string | null;
  x402Support: boolean;
  active: boolean;
  createdAt: number;
}

export interface AgentRegistry {
  id: string;
  totalAgents: number;
}

// ───────────────────────────────────────────────
// Module 2: sui_agent_policy
// ───────────────────────────────────────────────

export interface DelegationCap {
  id: string;
  agentId: string;
  delegator: string;
  allowedModules: string[];
  maxPerTx: number;
  dailyLimit: number;
  expiryEpoch: number;
  revocable: boolean;
  active: boolean;
}

export interface SpendRecord {
  id: string;
  capId: string;
  epoch: number;
  spentToday: number;
}

// ───────────────────────────────────────────────
// Module 3: sui_x402
// ───────────────────────────────────────────────

export interface PaymentRequest {
  id: string;
  resourceUri: string;
  amount: number;
  tokenType: string;
  recipient: string;
  expiry: number;
  fulfilled: boolean;
  payer: string | null;
}

export interface Receipt {
  id: string;
  requestId: string;
  payer: string;
  amount: number;
  paidAt: number;
}

// ───────────────────────────────────────────────
// Module 4: sui_reputation
// ───────────────────────────────────────────────

export interface ReputationRecord {
  id: string;
  agentId: string;
  stake: number;
  completedTasks: number;
  disputedTasks: number;
  score: number;
  totalEarned: number;
}

export interface Attestation {
  id: string;
  fromAgent: string;
  toAgent: string;
  taskId: string;
  rating: number;
  proofOfPayment: string;
  commentBlob: string;
  timestamp: number;
}

// ───────────────────────────────────────────────
// Module 5: sui_task_market
// ───────────────────────────────────────────────

export enum TaskStatus {
  Open = 0,
  Claimed = 1,
  Fulfilled = 2,
  Disputed = 3,
  Cancelled = 4,
}

export interface Task {
  id: string;
  poster: string;
  title: string;
  descriptionBlob: string;
  reward: number;
  requiredCapability: string;
  minReputationScore: number;
  deadlineEpoch: number;
  status: TaskStatus;
  assignedAgent: string | null;
  resultBlob: string | null;
}

export interface TaskBoard {
  id: string;
  openTasks: number;
  totalTasks: number;
}

// ───────────────────────────────────────────────
// Module 6: sui_stream
// ───────────────────────────────────────────────

export interface PaymentStream {
  id: string;
  payer: string;
  payee: string;
  balance: number;
  ratePerEpoch: number;
  startEpoch: number;
  lastClaimedEpoch: number;
  open: boolean;
}

// ───────────────────────────────────────────────
// Module 7: sui_a2a
// ───────────────────────────────────────────────

export enum MessageIntent {
  Request = 0,
  Fulfill = 1,
  Delegate = 2,
  Reject = 3,
  Ack = 4,
}

export interface AgentMessage {
  id: string;
  senderId: string;
  recipient: string;
  intent: MessageIntent;
  payloadBlob: string;
  paymentAttached: number;
  ttlEpoch: number;
  requiresAck: boolean;
  acked: boolean;
}

// ───────────────────────────────────────────────
// Module 8: sui_memory
// ───────────────────────────────────────────────

export enum MemoryType {
  Episodic = 0,
  Semantic = 1,
  Working = 2,
  Procedural = 3,
}

export interface MemoryAnchor {
  id: string;
  agentId: string;
  memoryType: MemoryType;
  blobId: string;
  contentHash: Uint8Array;
  epoch: number;
  publicReadable: boolean;
  tags: string[];
}

export interface MemoryIndex {
  id: string;
  agentId: string;
  anchorCount: number;
}

// ───────────────────────────────────────────────
// Shared SDK types
// ───────────────────────────────────────────────

export interface TransactionResult {
  digest: string;
  effects: {
    status: { status: string };
    created?: Array<{ reference: { objectId: string } }>;
  };
  objectChanges?: Array<{
    type: string;
    objectId: string;
    objectType: string;
  }>;
}

export interface RegisterAgentParams {
  registryId: string;
  name: string;
  capabilities: string[];
  endpointBlob: string;
  mcpEndpoint?: string;
  x402Support: boolean;
}

export interface CreateDelegationCapParams {
  agentId: string;
  allowedModules: string[];
  maxPerTx: number;
  dailyLimit: number;
  expiryEpoch: number;
  revocable: boolean;
}

export interface CreatePaymentRequestParams {
  resourceUri: string;
  amount: number;
  tokenType: string;
  recipient: string;
  ttl: number;
}

export interface PostTaskParams {
  boardId: string;
  title: string;
  descriptionBlob: string;
  rewardAmount: number;
  requiredCapability: string;
  minReputationScore: number;
  deadlineEpoch: number;
}

export interface OpenStreamParams {
  payee: string;
  ratePerEpoch: number;
  initialDeposit: number;
}

export interface SendMessageParams {
  agentId: string;
  recipient: string;
  intent: MessageIntent;
  payloadBlob: string;
  paymentAmount: number;
  ttlEpoch: number;
  requiresAck: boolean;
}

export interface StoreMemoryParams {
  agentId: string;
  indexId: string;
  memoryType: MemoryType;
  blobId: string;
  contentHash: Uint8Array;
  publicReadable: boolean;
  tags: string[];
}
