/**
 * @module gas
 * Smart gas estimation for Sui transactions via dry-run simulation.
 */

import type { SuiClient, DryRunTransactionBlockResponse } from "@mysten/sui/client";
import type { Transaction } from "@mysten/sui/transactions";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GasEstimate {
  /** Computation cost in MIST */
  computationCost: bigint;
  /** Storage cost in MIST */
  storageCost: bigint;
  /** Storage rebate in MIST */
  storageRebate: bigint;
  /** Net gas cost (computation + storage - rebate) */
  netCost: bigint;
  /** Recommended budget with buffer applied */
  recommendedBudget: bigint;
}

export interface EstimateOptions {
  /** Buffer multiplier (default: 1.2 = 20% headroom) */
  bufferMultiplier?: number;
  /** Minimum gas budget in MIST (default: 10_000_000 = 0.01 SUI) */
  minBudget?: bigint;
  /** Sender address override for dry run */
  sender?: string;
}

// ── Gas Estimation ───────────────────────────────────────────────────────────

/**
 * Estimate gas for a transaction via dry-run simulation.
 *
 * @example
 * ```ts
 * const estimate = await estimateGas(client, tx, senderAddress);
 * tx.setGasBudget(estimate.recommendedBudget);
 * ```
 */
export async function estimateGas(
  client: SuiClient,
  tx: Transaction,
  sender: string,
  options?: EstimateOptions
): Promise<GasEstimate> {
  const { bufferMultiplier = 1.2, minBudget = 10_000_000n } = options ?? {};

  tx.setSender(options?.sender ?? sender);

  const txBytes = await tx.build({ client });
  const dryRun: DryRunTransactionBlockResponse = await client.dryRunTransactionBlock({
    transactionBlock: txBytes,
  });

  if (dryRun.effects.status.status !== "success") {
    throw new Error(
      `Dry run failed: ${dryRun.effects.status.error ?? "unknown error"}`
    );
  }

  const gasUsed = dryRun.effects.gasUsed;
  const computationCost = BigInt(gasUsed.computationCost);
  const storageCost = BigInt(gasUsed.storageCost);
  const storageRebate = BigInt(gasUsed.storageRebate);
  const netCost = computationCost + storageCost - storageRebate;

  // Apply buffer and enforce minimum
  const buffered = BigInt(Math.ceil(Number(netCost) * bufferMultiplier));
  const recommendedBudget = buffered > minBudget ? buffered : minBudget;

  return {
    computationCost,
    storageCost,
    storageRebate,
    netCost,
    recommendedBudget,
  };
}

/**
 * Apply estimated gas budget directly to a transaction.
 * Convenience wrapper around `estimateGas`.
 */
export async function applyGasBudget(
  client: SuiClient,
  tx: Transaction,
  sender: string,
  options?: EstimateOptions
): Promise<GasEstimate> {
  const estimate = await estimateGas(client, tx, sender, options);
  tx.setGasBudget(estimate.recommendedBudget);
  return estimate;
}

// ── Gas Formatting ───────────────────────────────────────────────────────────

/** Convert MIST to SUI (1 SUI = 1e9 MIST) */
export function mistToSui(mist: bigint): number {
  return Number(mist) / 1_000_000_000;
}

/** Format a GasEstimate for logging */
export function formatGasEstimate(estimate: GasEstimate): string {
  return [
    `Computation: ${mistToSui(estimate.computationCost).toFixed(6)} SUI`,
    `Storage:     ${mistToSui(estimate.storageCost).toFixed(6)} SUI`,
    `Rebate:      ${mistToSui(estimate.storageRebate).toFixed(6)} SUI`,
    `Net:         ${mistToSui(estimate.netCost).toFixed(6)} SUI`,
    `Budget:      ${mistToSui(estimate.recommendedBudget).toFixed(6)} SUI`,
  ].join("\n");
}
