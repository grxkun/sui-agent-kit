// ─────────────────────────────────────────────────────────────────────────────
// types.ts — TypeScript mirrors of all sui-agent-kit Move structs
// Keep in sync with move/sources/*.move
// ─────────────────────────────────────────────────────────────────────────────

// ── sui_agent_id ──────────────────────────────────────────────────────────────

export interface AgentCard {
  id: string;
  owner: string;
  name: string;
  version: bigint;
  capabilities: string[];
  endpointBlob: string;
  mcpEndpoint: string | null;
  x402Support: boolean;
  active: boolean;
  createdAt: bigint;
}

export interface AgentRegistry {
  id: string;
  totalAgents: bigint;
}

export interface RegisterAgentParams {
  name: string;
  capabilities: string[];
  endpointBlob: string;
  mcpEndpoint?: string;
  x402Support?: boolean;
}

// ── sui_agent_policy ──────────────────────────────────────────────────────────

export interface DelegationCap {
  id: string;
  agentId: string;
  delegator: string;
  allowedModules: string[];
  maxPerTx: bigint;
  dailyLimit: bigint;
  expiryEpoch: bigint;
  revocable: boolean;
  active: boolean;
}

export interface SpendRecord {
  id: string;
  capId: string;
  epoch: bigint;
  spentToday: bigint;
}

export interface CreateDelegationCapParams {
  agentId: string;
  allowedModules: string[];
  maxPerTx: bigint;
  dailyLimit: bigint;
  expiryEpoch: bigint;
  revocable?: boolean;
}

// ── sui_x402 ──────────────────────────────────────────────────────────────────

export interface PaymentRequest {
  id: string;
  resourceUri: string;
  amount: bigint;
  tokenType: 'SUI' | 'USDC' | string;
  recipient: string;
  expiry: bigint;
  fulfilled: boolean;
  payer: string | null;
}

export interface Receipt {
  id: string;
  requestId: string;
  payer: string;
  amount: bigint;
  paidAt: bigint;
}

export interface CreatePaymentRequestParams {
  resourceUri: string;
  amount: bigint;
  tokenType?: 'SUI' | 'USDC';
  recipient: string;
  ttlMs?: bigint;
}

// ── sui_reputation ────────────────────────────────────────────────────────────

export interface ReputationRecord {
  id: string;
  agentId: string;
  stake: bigint;
  completedTasks: bigint;
  disputedTasks: bigint;
  score: bigint;
  totalEarned: bigint;
}

export interface Attestation {
  id: string;
  fromAgent: string;
  toAgent: string;
  taskId: string;
  rating: number;
  proofOfPayment: string;
  commentBlob: string;
  timestamp: bigint;
}

export interface AttestParams {
  fromAgentId: string;
  toReputationRecordId: string;
  taskId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  proofOfPaymentId: string;
  commentBlob?: string;
}

// ── sui_task_market ───────────────────────────────────────────────────────────

export enum TaskStatus {
  Open      = 0,
  Claimed   = 1,
  Fulfilled = 2,
  Disputed  = 3,
  Cancelled = 4,
}

export interface Task {
  id: string;
  poster: string;
  title: string;
  descriptionBlob: string;
  reward: bigint;
  requiredCapability: string;
  minReputationScore: bigint;
  deadlineEpoch: bigint;
  status: TaskStatus;
  assignedAgent: string | null;
  resultBlob: string | null;
}

export interface TaskBoard {
  id: string;
  openTasks: bigint;
  totalTasks: bigint;
}

export interface PostTaskParams {
  title: string;
  descriptionBlob: string;
  rewardMist: bigint;
  requiredCapability: string;
  minReputationScore?: bigint;
  deadlineEpoch: bigint;
}

// ── sui_stream ────────────────────────────────────────────────────────────────

export interface PaymentStream {
  id: string;
  payer: string;
  payee: string;
  balance: bigint;
  ratePerEpoch: bigint;
  startEpoch: bigint;
  lastClaimedEpoch: bigint;
  open: boolean;
}

export interface OpenStreamParams {
  payee: string;
  ratePerEpoch: bigint;
  initialDepositMist: bigint;
}

// ── sui_a2a ───────────────────────────────────────────────────────────────────

export enum MessageIntent {
  Request  = 0,
  Fulfill  = 1,
  Delegate = 2,
  Reject   = 3,
  Ack      = 4,
}

export interface AgentMessage {
  id: string;
  senderId: string;
  recipient: string;
  intent: MessageIntent;
  payloadBlob: string;
  paymentAttached: bigint;
  ttlEpoch: bigint;
  requiresAck: boolean;
  acked: boolean;
}

export interface SendMessageParams {
  senderAgentCardId: string;
  recipient: string;
  intent: MessageIntent;
  payloadBlob: string;
  paymentMist?: bigint;
  ttlEpoch: bigint;
  requiresAck?: boolean;
}

// ── sui_memory ────────────────────────────────────────────────────────────────

export enum MemoryType {
  Episodic   = 0,
  Semantic   = 1,
  Working    = 2,
  Procedural = 3,
}

export interface MemoryAnchor {
  id: string;
  agentId: string;
  memoryType: MemoryType;
  blobId: string;
  contentHash: Uint8Array;
  epoch: bigint;
  publicReadable: boolean;
  tags: string[];
}

export interface MemoryIndex {
  id: string;
  agentId: string;
  anchorCount: bigint;
}

export interface StoreMemoryParams {
  agentCardId: string;
  memoryType: MemoryType;
  blobId: string;
  contentHash: Uint8Array;
  publicReadable?: boolean;
  tags?: string[];
}

// ── Shared ────────────────────────────────────────────────────────────────────

export interface SuiAgentKitConfig {
  packageId: string;
  agentRegistryId: string;
  taskBoardId: string;
  network: 'localnet' | 'testnet' | 'mainnet';
}
