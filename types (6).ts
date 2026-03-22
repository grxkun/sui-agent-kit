// ─────────────────────────────────────────────────────────────────────────────
// policy.ts — Delegation policy SDK (wraps sui_agent_policy.move)
// ─────────────────────────────────────────────────────────────────────────────

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import type { CreateDelegationCapParams, DelegationCap, SpendRecord } from './types.js';

function toBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

export async function createDelegationCap(
  params: CreateDelegationCapParams,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
) {
  const tx = new Transaction();

  const moduleBytes = params.allowedModules.map((m) =>
    tx.pure.vector('u8', toBytes(m)),
  );

  tx.moveCall({
    target: `${packageId}::sui_agent_policy::create_delegation_cap`,
    arguments: [
      tx.pure.address(params.agentId),
      tx.makeMoveVec({ elements: moduleBytes }),
      tx.pure.u64(params.maxPerTx),
      tx.pure.u64(params.dailyLimit),
      tx.pure.u64(params.expiryEpoch),
      tx.pure.bool(params.revocable ?? true),
    ],
  });

  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
}

export async function revokeCap(
  capId: string,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_agent_policy::revoke`,
    arguments: [tx.object(capId)],
  });

  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true },
  });
}

export async function getCap(
  client: SuiClient,
  capId: string,
): Promise<DelegationCap | null> {
  try {
    const obj = await client.getObject({
      id: capId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      return null;
    }

    const f = obj.data.content.fields as Record<string, any>;
    return {
      id: capId,
      agentId: f.agent_id,
      delegator: f.delegator,
      allowedModules: f.allowed_modules?.contents ?? [],
      maxPerTx: BigInt(f.max_per_tx),
      dailyLimit: BigInt(f.daily_limit),
      expiryEpoch: BigInt(f.expiry_epoch),
      revocable: f.revocable,
      active: f.active,
    };
  } catch {
    return null;
  }
}

export async function checkAuthorization(
  client: SuiClient,
  capId: string,
  moduleName: string,
  amount: bigint,
): Promise<boolean> {
  const cap = await getCap(client, capId);
  if (!cap || !cap.active) return false;

  // Client-side pre-check (on-chain enforce happens in authorize_and_record)
  if (!cap.allowedModules.includes(moduleName)) return false;
  if (amount > cap.maxPerTx) return false;

  const { epoch } = await client.getLatestSuiSystemState();
  if (BigInt(epoch) > cap.expiryEpoch) return false;

  return true;
}
