/**
 * @module validation
 * Zod schemas for input validation across the SDK.
 * Validates inputs before they hit Move — saves gas on reverts.
 */

import { z } from "zod";

// ── Primitives ───────────────────────────────────────────────────────────────

/** Valid Sui address (0x + 64 hex chars) */
export const SuiAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid Sui address: must be 0x + 64 hex characters");

/** Valid Sui object ID */
export const ObjectId = SuiAddress;

/** Package ID */
export const PackageId = SuiAddress;

/** Positive SUI amount in MIST */
export const MistAmount = z.bigint().positive("Amount must be positive");

/** Positive SUI amount as number (converted to MIST internally) */
export const SuiAmount = z.number().positive("SUI amount must be positive");

/** Non-empty trimmed string with max length */
const boundedString = (max: number) =>
  z.string().trim().min(1, "Cannot be empty").max(max, `Max ${max} characters`);

// ── Agent Identity ───────────────────────────────────────────────────────────

export const RegisterAgentSchema = z.object({
  name: boundedString(100),
  description: boundedString(500).optional(),
  capabilities: z
    .array(z.string().trim().min(1).max(50))
    .min(1, "At least one capability required")
    .max(20, "Max 20 capabilities"),
  endpoint: z.string().url("Must be a valid URL").optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type RegisterAgentParams = z.infer<typeof RegisterAgentSchema>;

// ── Delegation ───────────────────────────────────────────────────────────────

export const CreateDelegationSchema = z.object({
  agentId: ObjectId,
  delegateTo: SuiAddress,
  permissions: z
    .array(z.string().trim().min(1).max(50))
    .min(1, "At least one permission required"),
  expiresAt: z.number().int().positive().optional(),
  maxSpend: MistAmount.optional(),
});

export type CreateDelegationParams = z.infer<typeof CreateDelegationSchema>;

// ── Task Market ──────────────────────────────────────────────────────────────

export const PostTaskSchema = z.object({
  title: boundedString(200),
  description: boundedString(2000),
  requiredCapability: z.string().trim().min(1).max(50),
  rewardAmount: MistAmount,
  deadline: z.number().int().positive("Deadline must be a future epoch timestamp"),
  minReputationScore: z.number().int().min(0).max(10000).default(0),
});

export type PostTaskParams = z.infer<typeof PostTaskSchema>;

export const ClaimTaskSchema = z.object({
  taskId: ObjectId,
  agentId: ObjectId,
});

export type ClaimTaskParams = z.infer<typeof ClaimTaskSchema>;

export const FulfillTaskSchema = z.object({
  taskId: ObjectId,
  agentId: ObjectId,
  resultData: boundedString(5000),
});

export type FulfillTaskParams = z.infer<typeof FulfillTaskSchema>;

// ── Reputation ───────────────────────────────────────────────────────────────

export const UpdateReputationSchema = z.object({
  agentId: ObjectId,
  delta: z.number().int(),
  reason: boundedString(200),
});

export type UpdateReputationParams = z.infer<typeof UpdateReputationSchema>;

// ── Payments / x402 ──────────────────────────────────────────────────────────

export const StreamPaymentSchema = z.object({
  recipient: SuiAddress,
  totalAmount: MistAmount,
  intervalMs: z.number().int().min(1000, "Minimum 1s interval"),
  durationMs: z.number().int().min(1000, "Minimum 1s duration"),
});

export type StreamPaymentParams = z.infer<typeof StreamPaymentSchema>;

// ── Walrus Memory ────────────────────────────────────────────────────────────

export const StoreMemorySchema = z.object({
  agentId: ObjectId,
  key: boundedString(200),
  value: z.string().max(50_000, "Max 50KB per memory entry"),
  ttl: z.number().int().positive().optional(),
});

export type StoreMemoryParams = z.infer<typeof StoreMemorySchema>;

// ── Messaging ────────────────────────────────────────────────────────────────

export const SendMessageSchema = z.object({
  from: ObjectId,
  to: ObjectId,
  channel: boundedString(100),
  payload: z.string().max(10_000, "Max 10KB message payload"),
  replyTo: ObjectId.optional(),
});

export type SendMessageParams = z.infer<typeof SendMessageSchema>;

// ── Validation Helper ────────────────────────────────────────────────────────

/**
 * Validate input against a schema, returning a typed result.
 * Throws `ZodError` with formatted messages on failure.
 *
 * @example
 * ```ts
 * const params = validate(RegisterAgentSchema, rawInput);
 * // params is fully typed as RegisterAgentParams
 * ```
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}
