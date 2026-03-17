import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Keypair } from "@mysten/sui/cryptography";
import type { ReputationRecord, TransactionResult } from "./types";

export async function initReputation(
  agentId: string,
  stakeAmount: number,
  packageId: string,
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();
  const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(stakeAmount)]);

  tx.moveCall({
    target: `${packageId}::sui_reputation::init_reputation`,
    arguments: [tx.pure.id(agentId), stakeCoin],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  return result as unknown as TransactionResult;
}

export async function addStake(
  recordId: string,
  amount: number,
  packageId: string,
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);

  tx.moveCall({
    target: `${packageId}::sui_reputation::add_stake`,
    arguments: [tx.object(recordId), coin],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return result as unknown as TransactionResult;
}

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
  const stakeFields = fields["stake"] as { fields?: { value?: string } };

  return {
    id: recordId,
    agentId: fields["agent_id"] as string,
    stake: Number(stakeFields?.fields?.value ?? 0),
    completedTasks: Number(fields["completed_tasks"]),
    disputedTasks: Number(fields["disputed_tasks"]),
    score: Number(fields["score"]),
    totalEarned: Number(fields["total_earned"]),
  };
}

export async function getReputationByAgent(
  client: SuiClient,
  owner: string,
  packageId: string
): Promise<ReputationRecord[]> {
  const objects = await client.getOwnedObjects({
    owner,
    filter: {
      StructType: `${packageId}::sui_reputation::ReputationRecord`,
    },
    options: { showContent: true },
  });

  return objects.data
    .filter(
      (o) => o.data?.content && o.data.content.dataType === "moveObject"
    )
    .map((o) => {
      const fields = (o.data!.content as { fields: Record<string, unknown> })
        .fields;
      const stakeFields = fields["stake"] as {
        fields?: { value?: string };
      };
      return {
        id: o.data!.objectId,
        agentId: fields["agent_id"] as string,
        stake: Number(stakeFields?.fields?.value ?? 0),
        completedTasks: Number(fields["completed_tasks"]),
        disputedTasks: Number(fields["disputed_tasks"]),
        score: Number(fields["score"]),
        totalEarned: Number(fields["total_earned"]),
      };
    });
}
