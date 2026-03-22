// ─────────────────────────────────────────────────────────────────────────────
// reputation.ts — Reputation SDK (wraps sui_reputation.move)
// ─────────────────────────────────────────────────────────────────────────────

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import type { AttestParams, ReputationRecord } from './types.js';

const CLOCK = '0x6';

function toBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

export async function initReputation(
  agentId: string,
  stakeMist: bigint,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
) {
  const tx = new Transaction();
  const [stake] = tx.splitCoins(tx.gas, [Number(stakeMist)]);

  tx.moveCall({
    target: `${packageId}::sui_reputation::init_reputation`,
    arguments: [tx.pure.address(agentId), stake],
  });

  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
}

export async function attest(
  params: AttestParams,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_reputation::attest`,
    arguments: [
      tx.pure.address(params.fromAgentId),
      tx.object(params.toReputationRecordId),
      tx.pure.address(params.taskId),
      tx.pure.u8(params.rating),
      tx.pure.address(params.proofOfPaymentId),
      tx.pure.vector('u8', toBytes(params.commentBlob ?? '')),
      tx.object(CLOCK),
    ],
  });

  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
}

export async function getReputationRecord(
  client: SuiClient,
  recordId: string,
): Promise<ReputationRecord | null> {
  try {
    const obj = await client.getObject({
      id: recordId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      return null;
    }

    const f = obj.data.content.fields as Record<string, any>;
    return {
      id: recordId,
      agentId: f.agent_id,
      stake: BigInt(f.stake?.value ?? 0),
      completedTasks: BigInt(f.completed_tasks),
      disputedTasks: BigInt(f.disputed_tasks),
      score: BigInt(f.score),
      totalEarned: BigInt(f.total_earned),
    };
  } catch {
    return null;
  }
}

export async function getScore(
  client: SuiClient,
  recordId: string,
): Promise<bigint> {
  const record = await getReputationRecord(client, recordId);
  return record?.score ?? 0n;
}
