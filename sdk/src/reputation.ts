/**
 * reputation.ts — SDK bindings for Module 4: sui_reputation
 */
import {
  SuiClient,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import type { Keypair } from "@mysten/sui/cryptography";
import { bcs } from "@mysten/sui/bcs";
import type { ReputationRecord, Attestation, TransactionResult } from "./types.js";

export interface InitReputationParams {
  packageId: string;
  agentId: string;
  stakeAmountMist: bigint;
}

/**
 * Initialise a ReputationRecord for an agent with an initial SUI stake.
 */
export async function initReputation(
  params: InitReputationParams,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [
    tx.pure(bcs.u64().serialize(params.stakeAmountMist).toBytes()),
  ]);

  tx.moveCall({
    target: `${params.packageId}::sui_reputation::init_reputation`,
    arguments: [
      tx.pure(bcs.Address.serialize(params.agentId).toBytes()),
      coin,
    ],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return { digest: result.digest, effects: result.effects };
}

/**
 * Add extra stake to a ReputationRecord.
 */
export async function addStake(
  packageId: string,
  recordId: string,
  extraMist: bigint,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [
    tx.pure(bcs.u64().serialize(extraMist).toBytes()),
  ]);

  tx.moveCall({
    target: `${packageId}::sui_reputation::add_stake`,
    arguments: [tx.object(recordId), coin],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return { digest: result.digest, effects: result.effects };
}

/**
 * Submit an attestation for an agent's completed task.
 */
export interface AttestParams {
  packageId: string;
  clockId: string;
  fromAgentId: string;
  toRecordId: string;
  taskId: string;
  rating: number;
  proofOfPaymentId: string;
  commentBlob: string;
}

export async function attest(
  params: AttestParams,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::sui_reputation::attest`,
    arguments: [
      tx.pure(bcs.Address.serialize(params.fromAgentId).toBytes()),
      tx.object(params.toRecordId),
      tx.pure(bcs.Address.serialize(params.taskId).toBytes()),
      tx.pure(bcs.u8().serialize(params.rating).toBytes()),
      tx.pure(bcs.Address.serialize(params.proofOfPaymentId).toBytes()),
      tx.pure(bcs.string().serialize(params.commentBlob).toBytes()),
      tx.object(params.clockId),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return { digest: result.digest, effects: result.effects };
}

/**
 * Fetch a ReputationRecord by its on-chain ID.
 */
export async function getReputation(
  client: SuiClient,
  recordId: string
): Promise<ReputationRecord | null> {
  const obj = await client.getObject({
    id: recordId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return null;
  }

  const fields = obj.data.content.fields as Record<string, unknown>;
  const stakeFields = fields["stake"] as { fields?: { balance?: string } } | undefined;
  const stakeValue = stakeFields?.fields?.balance ?? String(fields["stake"] ?? "0");

  return {
    id: recordId,
    agent_id: String(fields["agent_id"] ?? ""),
    stake: stakeValue,
    completed_tasks: String(fields["completed_tasks"] ?? "0"),
    disputed_tasks: String(fields["disputed_tasks"] ?? "0"),
    score: String(fields["score"] ?? "0"),
    total_earned: String(fields["total_earned"] ?? "0"),
  };
}

/**
 * Fetch an Attestation object by its on-chain ID.
 */
export async function getAttestation(
  client: SuiClient,
  attestationId: string
): Promise<Attestation | null> {
  const obj = await client.getObject({
    id: attestationId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return null;
  }

  const fields = obj.data.content.fields as Record<string, unknown>;

  return {
    id: attestationId,
    from_agent: String(fields["from_agent"] ?? ""),
    to_agent: String(fields["to_agent"] ?? ""),
    task_id: String(fields["task_id"] ?? ""),
    rating: Number(fields["rating"] ?? 0),
    proof_of_payment: String(fields["proof_of_payment"] ?? ""),
    comment_blob: String(fields["comment_blob"] ?? ""),
    timestamp: String(fields["timestamp"] ?? "0"),
  };
}
