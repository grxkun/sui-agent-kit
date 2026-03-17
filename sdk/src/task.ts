import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Keypair } from "@mysten/sui/cryptography";
import type {
  Task,
  TaskStatus,
  PostTaskParams,
  TransactionResult,
} from "./types";

const CLOCK_ID = "0x6";

export async function postTask(
  params: PostTaskParams & { packageId: string },
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();
  const [rewardCoin] = tx.splitCoins(tx.gas, [
    tx.pure.u64(params.rewardAmount),
  ]);

  tx.moveCall({
    target: `${params.packageId}::sui_task_market::post_task`,
    arguments: [
      tx.object(params.boardId),
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(params.title))
      ),
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(params.descriptionBlob))
      ),
      rewardCoin,
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(params.requiredCapability))
      ),
      tx.pure.u64(params.minReputationScore),
      tx.pure.u64(params.deadlineEpoch),
      tx.object(CLOCK_ID),
    ],
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

export async function claimTask(
  taskId: string,
  agentId: string,
  reputationId: string,
  packageId: string,
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_task_market::claim_task`,
    arguments: [
      tx.object(taskId),
      tx.object(agentId),
      tx.object(reputationId),
      tx.object(CLOCK_ID),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return result as unknown as TransactionResult;
}

export async function fulfillTask(
  taskId: string,
  agentId: string,
  resultBlob: string,
  packageId: string,
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_task_market::fulfill_task`,
    arguments: [
      tx.object(taskId),
      tx.object(agentId),
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(resultBlob))
      ),
      tx.object(CLOCK_ID),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return result as unknown as TransactionResult;
}

export async function acceptResult(
  taskId: string,
  packageId: string,
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_task_market::accept_result`,
    arguments: [tx.object(taskId)],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return result as unknown as TransactionResult;
}

export async function getOpenTasks(
  client: SuiClient,
  packageId: string,
  capability?: string
): Promise<Task[]> {
  const events = await client.queryEvents({
    query: {
      MoveEventType: `${packageId}::sui_task_market::TaskPosted`,
    },
    limit: 50,
    order: "descending",
  });

  const tasks: Task[] = [];
  for (const event of events.data) {
    const taskId = (event.parsedJson as Record<string, string>)["task_id"];
    const task = await getTask(client, taskId);
    if (task && task.status === 0) {
      if (!capability || task.requiredCapability === capability) {
        tasks.push(task);
      }
    }
  }

  return tasks;
}

export async function getTasksByAgent(
  client: SuiClient,
  packageId: string,
  agentId: string
): Promise<Task[]> {
  const events = await client.queryEvents({
    query: {
      MoveEventType: `${packageId}::sui_task_market::TaskClaimed`,
    },
    limit: 50,
    order: "descending",
  });

  const tasks: Task[] = [];
  for (const event of events.data) {
    const parsed = event.parsedJson as Record<string, string>;
    if (parsed["agent_id"] === agentId) {
      const task = await getTask(client, parsed["task_id"]);
      if (task) tasks.push(task);
    }
  }

  return tasks;
}

async function getTask(
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

  const fields = obj.data.content.fields as Record<string, unknown>;
  const rewardFields = fields["reward"] as { fields?: { value?: string } };

  return {
    id: taskId,
    poster: fields["poster"] as string,
    title: fields["title"] as string,
    descriptionBlob: fields["description_blob"] as string,
    reward: Number(rewardFields?.fields?.value ?? 0),
    requiredCapability: fields["required_capability"] as string,
    minReputationScore: Number(fields["min_reputation_score"]),
    deadlineEpoch: Number(fields["deadline_epoch"]),
    status: Number(fields["status"]) as TaskStatus,
    assignedAgent: (fields["assigned_agent"] as string) || null,
    resultBlob: (fields["result_blob"] as string) || null,
  };
}
