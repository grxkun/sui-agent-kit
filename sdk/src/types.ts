/**
 * types.ts — TypeScript mirrors of all 8 Move structs.
 * Kept as plain interfaces so callers can deserialise BCS-decoded objects
 * directly into these shapes.
 */

// ─── Module 1: sui_agent_id ────────────────────────────────────────────────

export interface AgentCard {
  id: string;
  owner: string;
  name: string;
  version: string;
  capabilities: string[];
  endpoint_blob: string;
  mcp_endpoint: string | null;
  x402_support: boolean;
  active: boolean;
  created_at: string;
}

export interface AgentRegistry {
  id: string;
  total_agents: string;
}

// ─── Module 2: sui_agent_policy ───────────────────────────────────────────

export interface DelegationCap {
  id: string;
  agent_id: string;
  delegator: string;
  allowed_modules: string[];
  max_per_tx: string;
  daily_limit: string;
  expiry_epoch: string;
  revocable: boolean;
  active: boolean;
}

export interface SpendRecord {
  id: string;
  cap_id: string;
  epoch: string;
  spent_today: string;
}

// ─── Module 3: sui_x402 ───────────────────────────────────────────────────

export interface PaymentRequest {
  id: string;
  resource_uri: string;
  amount: string;
  token_type: string;
  recipient: string;
  expiry: string;
  fulfilled: boolean;
  payer: string | null;
  creator: string;
}

export interface Receipt {
  id: string;
  request_id: string;
  payer: string;
  amount: string;
  paid_at: string;
}

// ─── Module 4: sui_reputation ─────────────────────────────────────────────

export interface ReputationRecord {
  id: string;
  agent_id: string;
  stake: string;            // MIST value
  completed_tasks: string;
  disputed_tasks: string;
  score: string;
  total_earned: string;
}

export interface Attestation {
  id: string;
  from_agent: string;
  to_agent: string;
  task_id: string;
  rating: number;
  proof_of_payment: string;
  comment_blob: string;
  timestamp: string;
}

// ─── Module 5: sui_task_market ────────────────────────────────────────────

export type TaskStatus = 0 | 1 | 2 | 3 | 4; // Open | Claimed | Fulfilled | Disputed | Cancelled

export interface Task {
  id: string;
  poster: string;
  title: string;
  description_blob: string;
  reward: string;           // MIST balance
  required_capability: string;
  min_reputation_score: string;
  deadline_epoch: string;
  status: TaskStatus;
  assigned_agent: string | null;
  result_blob: string | null;
}

export interface TaskBoard {
  id: string;
  open_tasks: string;
  total_tasks: string;
}

// ─── Module 6: sui_stream ─────────────────────────────────────────────────

export interface PaymentStream {
  id: string;
  payer: string;
  payee: string;
  balance: string;          // MIST
  rate_per_epoch: string;
  start_epoch: string;
  last_claimed_epoch: string;
  open: boolean;
}

// ─── Module 7: sui_a2a ────────────────────────────────────────────────────

export type MessageIntent = 0 | 1 | 2 | 3 | 4; // request | fulfill | delegate | reject | ack

export interface AgentMessage {
  id: string;
  sender_id: string;
  sender_address: string;
  recipient: string;
  intent: MessageIntent;
  payload_blob: string;
  payment_attached: string; // MIST
  ttl_epoch: string;
  requires_ack: boolean;
  acked: boolean;
}

// ─── Module 8: sui_memory ─────────────────────────────────────────────────

export type MemoryType = 0 | 1 | 2 | 3; // episodic | semantic | working | procedural

export interface MemoryAnchor {
  id: string;
  agent_id: string;
  memory_type: MemoryType;
  blob_id: string;
  content_hash: number[];   // Uint8Array serialised as number[]
  epoch: string;
  public_readable: boolean;
  tags: string[];
}

export interface MemoryIndex {
  id: string;
  agent_id: string;
  anchor_count: string;
}

// ─── SDK result type ──────────────────────────────────────────────────────

export interface TransactionResult {
  digest: string;
  effects?: unknown;
}
