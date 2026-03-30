/**
 * @module batch
 * Transaction batching — combine multiple Move calls into a single PTB.
 * Claiming 10 tasks = 1 transaction instead of 10.
 */

import { Transaction } from "@mysten/sui/transactions";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MoveCallSpec {
  target: `${string}::${string}::${string}`;
  arguments?: (
    | { kind: "object"; value: string }
    | { kind: "pure"; value: string | number | bigint | boolean }
  )[];
  typeArguments?: string[];
}

export interface BatchOptions {
  /** Gas budget override (auto-estimated if omitted) */
  gasBudget?: bigint;
  /** Sender address */
  sender?: string;
}

// ── Batch Builder ────────────────────────────────────────────────────────────

/**
 * Composable batch builder for Sui PTBs.
 *
 * @example
 * ```ts
 * const result = await new BatchBuilder(client, signer)
 *   .add({
 *     target: `${pkg}::sui_task_market::claim_task`,
 *     arguments: [
 *       { kind: "object", value: taskId1 },
 *       { kind: "object", value: agentId },
 *     ],
 *   })
 *   .add({
 *     target: `${pkg}::sui_task_market::claim_task`,
 *     arguments: [
 *       { kind: "object", value: taskId2 },
 *       { kind: "object", value: agentId },
 *     ],
 *   })
 *   .execute();
 * ```
 */
export class BatchBuilder {
  private calls: MoveCallSpec[] = [];
  private tx: Transaction;

  constructor(
    private readonly client: { signAndExecuteTransaction: Function; [k: string]: any },
    private readonly signer: any,
    private readonly options?: BatchOptions
  ) {
    this.tx = new Transaction();
  }

  /**
   * Add a Move call to the batch.
   */
  add(call: MoveCallSpec): this {
    this.calls.push(call);
    return this;
  }

  /**
   * Add multiple Move calls at once.
   */
  addAll(calls: MoveCallSpec[]): this {
    this.calls.push(...calls);
    return this;
  }

  /**
   * Get the number of queued calls.
   */
  get size(): number {
    return this.calls.length;
  }

  /**
   * Build the transaction without executing.
   */
  build(): Transaction {
    const tx = new Transaction();

    if (this.options?.sender) {
      tx.setSender(this.options.sender);
    }

    for (const call of this.calls) {
      const args = (call.arguments ?? []).map((arg) => {
        if (arg.kind === "object") return tx.object(arg.value);
        return tx.pure.address(String(arg.value));
      });

      tx.moveCall({
        target: call.target,
        arguments: args,
        typeArguments: call.typeArguments,
      });
    }

    if (this.options?.gasBudget) {
      tx.setGasBudget(this.options.gasBudget);
    }

    return tx;
  }

  /**
   * Build and execute the batched transaction.
   */
  async execute() {
    if (this.calls.length === 0) {
      throw new Error("Cannot execute empty batch — add at least one call.");
    }

    const tx = this.build();
    return await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.signer,
      options: { showEffects: true, showEvents: true },
    });
  }

  /**
   * Reset the builder for reuse.
   */
  clear(): this {
    this.calls = [];
    this.tx = new Transaction();
    return this;
  }
}

// ── Convenience Functions ────────────────────────────────────────────────────

/**
 * Batch-claim multiple tasks in a single PTB.
 */
export function batchClaimTasks(
  packageId: string,
  taskIds: string[],
  agentId: string,
  boardId: string
): MoveCallSpec[] {
  return taskIds.map((taskId) => ({
    target: `${packageId}::sui_task_market::claim_task` as const,
    arguments: [
      { kind: "object" as const, value: boardId },
      { kind: "object" as const, value: taskId },
      { kind: "object" as const, value: agentId },
    ],
  }));
}

/**
 * Batch-send messages to multiple agents.
 */
export function batchSendMessages(
  packageId: string,
  fromAgentId: string,
  messages: { toAgentId: string; channel: string; payload: string }[]
): MoveCallSpec[] {
  return messages.map((msg) => ({
    target: `${packageId}::sui_agent_messaging::send_message` as const,
    arguments: [
      { kind: "object" as const, value: fromAgentId },
      { kind: "object" as const, value: msg.toAgentId },
      { kind: "pure" as const, value: msg.channel },
      { kind: "pure" as const, value: msg.payload },
    ],
  }));
}
