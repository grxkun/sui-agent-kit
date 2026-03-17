/**
 * task.ts — SDK bindings for Module 5: sui_task_market
 */
import {
  SuiClient,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import type { Keypair } from "@mysten/sui/cryptography";
import { bcs } from "@mysten/sui/bcs";
import type { Task, TransactionResult } from "./types.js";

export interface PostTaskParams {
  packageId: string;
  boardId: string;
  clockId: string;
  title: string;
  descriptionBlob: string;
  rewardMist: bigint;
  requiredCapability: string;
  minReputationScore: bigint;
  deadlineEpoch: bigint;
}

/**
 * Post a new task to the shared TaskBoard.
 */
export async function postTask(
  params: PostTaskParams,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();
  const [reward] = tx.splitCoins(tx.gas, [
    tx.pure(bcs.u64().serialize(params.rewardMist).toBytes()),
  ]);

  tx.moveCall({
    target: `${params.packageId}::sui_task_market::post_task`,
    arguments: [
      tx.object(params.boardId),
      tx.pure(bcs.string().serialize(params.title).toBytes()),
      tx.pure(bcs.string().serialize(params.descriptionBlob).toBytes()),
      reward,
      tx.pure(bcs.string().serialize(params.requiredCapability).toBytes()),
      tx.pure(bcs.u64().serialize(params.minReputationScore).toBytes()),
      tx.pure(bcs.u64().serialize(params.deadlineEpoch).toBytes()),
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
 * Claim an open task as an agent.
 */
export async function claimTask(
  packageId: string,
  taskId: string,
  agentCardId: string,
  reputationRecordId: string,
  clockId: string,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_task_market::claim_task`,
    arguments: [
      tx.object(taskId),
      tx.object(agentCardId),
      tx.object(reputationRecordId),
      tx.object(clockId),
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
 * Fulfill a claimed task with a result Walrus blob CID.
 */
export async function fulfillTask(
  packageId: string,
  taskId: string,
  agentCardId: string,
  resultBlob: string,
  clockId: string,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_task_market::fulfill_task`,
    arguments: [
      tx.object(taskId),
      tx.object(agentCardId),
      tx.pure(bcs.string().serialize(resultBlob).toBytes()),
      tx.object(clockId),
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
 * Fetch all open tasks from the TaskBoard (paginates all shared Task objects).
 */
export async function getOpenTasks(
  client: SuiClient,
  packageId: string,
  capability?: string
): Promise<Task[]> {
  // Query all shared Task objects and filter by status==0 (Open)
  const query = await client.queryEvents({
    query: {
      MoveEventType: `${packageId}::sui_task_market::TaskPosted`,
    },
    limit: 50,
  });

  const tasks: Task[] = [];
  for (const ev of query.data) {
    const fields = ev.parsedJson as Record<string, unknown> | undefined;
    if (!fields) continue;
    const taskId = String(fields["task_id"] ?? "");
    if (!taskId) continue;

    const task = await getTask(client, taskId);
    if (!task) continue;
    if (task.status !== 0) continue;
    if (capability && task.required_capability !== capability) continue;
    tasks.push(task);
  }
  return tasks;
}

/**
 * Fetch all tasks assigned to a specific agent (uses event log).
 */
export async function getTasksByAgent(
  client: SuiClient,
  packageId: string,
  agentId: string
): Promise<Task[]> {
  const query = await client.queryEvents({
    query: {
      MoveEventType: `${packageId}::sui_task_market::TaskClaimed`,
    },
    limit: 50,
  });

  const tasks: Task[] = [];
  for (const ev of query.data) {
    const fields = ev.parsedJson as Record<string, unknown> | undefined;
    if (!fields) continue;
    if (String(fields["agent_id"] ?? "") !== agentId) continue;
    const taskId = String(fields["task_id"] ?? "");
    if (!taskId) continue;
    const task = await getTask(client, taskId);
    if (task) tasks.push(task);
  }
  return tasks;
}

/**
 * Fetch a single Task object by ID.
 */
export async function getTask(
  client: SuiClient,
  taskId: string
): Promise<Task | null> {
  const obj = await client.getObject({
    id: taskId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return null;
  }

  const f = obj.data.content.fields as Record<string, unknown>;
  const rewardFields = f["reward"] as { fields?: { balance?: string } } | undefined;
  const rewardValue = rewardFields?.fields?.balance ?? String(f["reward"] ?? "0");

  const assignedRaw = f["assigned_agent"] as { fields?: { vec?: string[] } } | null | undefined;
  const assigned = assignedRaw?.fields?.vec?.[0] ?? null;

  const resultRaw = f["result_blob"] as { fields?: { vec?: string[] } } | null | undefined;
  const resultBlob = resultRaw?.fields?.vec?.[0] ?? null;

  return {
    id: taskId,
    poster: String(f["poster"] ?? ""),
    title: String(f["title"] ?? ""),
    description_blob: String(f["description_blob"] ?? ""),
    reward: rewardValue,
    required_capability: String(f["required_capability"] ?? ""),
    min_reputation_score: String(f["min_reputation_score"] ?? "0"),
    deadline_epoch: String(f["deadline_epoch"] ?? "0"),
    status: Number(f["status"] ?? 0) as Task["status"],
    assigned_agent: assigned,
    result_blob: resultBlob,
  };
}
