/**
 * policy.ts — SDK bindings for Module 2: sui_agent_policy
 */
import {
  SuiClient,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import type { Keypair } from "@mysten/sui/cryptography";
import { bcs } from "@mysten/sui/bcs";
import type { DelegationCap, TransactionResult } from "./types.js";

export interface CreateDelegationCapParams {
  packageId: string;
  agentId: string;
  allowedModules: string[];
  maxPerTx: bigint;
  dailyLimit: bigint;
  expiryEpoch: bigint;
  revocable: boolean;
}

/**
 * Create a DelegationCap with the given spending policy.
 */
export async function createDelegationCap(
  params: CreateDelegationCapParams,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::sui_agent_policy::create_cap`,
    arguments: [
      tx.pure(bcs.Address.serialize(params.agentId).toBytes()),
      tx.pure(
        bcs.vector(bcs.string()).serialize(params.allowedModules).toBytes()
      ),
      tx.pure(bcs.u64().serialize(params.maxPerTx).toBytes()),
      tx.pure(bcs.u64().serialize(params.dailyLimit).toBytes()),
      tx.pure(bcs.u64().serialize(params.expiryEpoch).toBytes()),
      tx.pure(bcs.bool().serialize(params.revocable).toBytes()),
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
 * Revoke an existing DelegationCap.
 */
export async function revokeCap(
  packageId: string,
  capId: string,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_agent_policy::revoke_cap`,
    arguments: [tx.object(capId)],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return { digest: result.digest, effects: result.effects };
}

/**
 * Fetch a DelegationCap by its on-chain ID.
 */
export async function getCap(
  client: SuiClient,
  capId: string
): Promise<DelegationCap | null> {
  const obj = await client.getObject({
    id: capId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return null;
  }

  const fields = obj.data.content.fields as Record<string, unknown>;
  const mods = fields["allowed_modules"] as
    | { fields?: { contents?: string[] } }
    | string[]
    | undefined;
  const modList: string[] = Array.isArray(mods)
    ? mods
    : (mods?.fields?.contents ?? []);

  return {
    id: capId,
    agent_id: String(fields["agent_id"] ?? ""),
    delegator: String(fields["delegator"] ?? ""),
    allowed_modules: modList,
    max_per_tx: String(fields["max_per_tx"] ?? "0"),
    daily_limit: String(fields["daily_limit"] ?? "0"),
    expiry_epoch: String(fields["expiry_epoch"] ?? "0"),
    revocable: Boolean(fields["revocable"]),
    active: Boolean(fields["active"]),
  };
}

/**
 * Off-chain authorization check — reads cap and record state locally.
 */
export async function checkAuthorization(
  client: SuiClient,
  capId: string,
  moduleName: string,
  amount: bigint
): Promise<boolean> {
  const cap = await getCap(client, capId);
  if (!cap || !cap.active) return false;
  if (!cap.allowed_modules.includes(moduleName)) return false;
  if (amount > BigInt(cap.max_per_tx)) return false;
  return true;
}
