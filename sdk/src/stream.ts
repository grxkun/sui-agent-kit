/**
 * stream.ts — SDK bindings for Module 6: sui_stream
 */
import {
  SuiClient,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import type { Keypair } from "@mysten/sui/cryptography";
import { bcs } from "@mysten/sui/bcs";
import type { PaymentStream, TransactionResult } from "./types.js";

export interface OpenStreamParams {
  packageId: string;
  clockId: string;
  payee: string;
  ratePerEpoch: bigint;
  initialDepositMist: bigint;
}

/**
 * Open a new PaymentStream.
 */
export async function openStream(
  params: OpenStreamParams,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();
  const [deposit] = tx.splitCoins(tx.gas, [
    tx.pure(bcs.u64().serialize(params.initialDepositMist).toBytes()),
  ]);

  tx.moveCall({
    target: `${params.packageId}::sui_stream::open_stream`,
    arguments: [
      tx.pure(bcs.Address.serialize(params.payee).toBytes()),
      tx.pure(bcs.u64().serialize(params.ratePerEpoch).toBytes()),
      deposit,
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
 * Payee claims accrued stream balance.
 */
export async function claimStream(
  packageId: string,
  streamId: string,
  clockId: string,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_stream::claim`,
    arguments: [tx.object(streamId), tx.object(clockId)],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return { digest: result.digest, effects: result.effects };
}

/**
 * Top up a stream's balance.
 */
export async function topUp(
  packageId: string,
  streamId: string,
  amountMist: bigint,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [
    tx.pure(bcs.u64().serialize(amountMist).toBytes()),
  ]);

  tx.moveCall({
    target: `${packageId}::sui_stream::top_up`,
    arguments: [tx.object(streamId), coin],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return { digest: result.digest, effects: result.effects };
}

/**
 * Payer closes the stream and reclaims remaining balance.
 */
export async function closeStream(
  packageId: string,
  streamId: string,
  clockId: string,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_stream::close`,
    arguments: [tx.object(streamId), tx.object(clockId)],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return { digest: result.digest, effects: result.effects };
}

/**
 * Fetch the current balance of a stream object.
 */
export async function getStreamBalance(
  client: SuiClient,
  streamId: string
): Promise<number> {
  const obj = await client.getObject({
    id: streamId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return 0;
  }

  const fields = obj.data.content.fields as Record<string, unknown>;
  const balFields = fields["balance"] as { fields?: { balance?: string } } | undefined;
  const balValue = balFields?.fields?.balance ?? String(fields["balance"] ?? "0");
  return Number(balValue);
}

/**
 * Fetch a full PaymentStream object.
 */
export async function getStream(
  client: SuiClient,
  streamId: string
): Promise<PaymentStream | null> {
  const obj = await client.getObject({
    id: streamId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return null;
  }

  const f = obj.data.content.fields as Record<string, unknown>;
  const balFields = f["balance"] as { fields?: { balance?: string } } | undefined;
  const bal = balFields?.fields?.balance ?? String(f["balance"] ?? "0");

  return {
    id: streamId,
    payer: String(f["payer"] ?? ""),
    payee: String(f["payee"] ?? ""),
    balance: bal,
    rate_per_epoch: String(f["rate_per_epoch"] ?? "0"),
    start_epoch: String(f["start_epoch"] ?? "0"),
    last_claimed_epoch: String(f["last_claimed_epoch"] ?? "0"),
    open: Boolean(f["open"]),
  };
}
