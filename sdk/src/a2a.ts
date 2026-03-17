/**
 * a2a.ts — SDK bindings for Module 7: sui_a2a
 */
import {
  SuiClient,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import type { Keypair } from "@mysten/sui/cryptography";
import { bcs } from "@mysten/sui/bcs";
import type { AgentMessage, MessageIntent, TransactionResult } from "./types.js";

export interface SendMessageParams {
  packageId: string;
  clockId: string;
  senderAgentCardId: string;
  recipient: string;
  intent: MessageIntent;
  payloadBlob: string;
  paymentMist: bigint;
  ttlEpoch: bigint;
  requiresAck: boolean;
}

/**
 * Send an A2A message with optional attached SUI payment.
 */
export async function sendMessage(
  params: SendMessageParams,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();

  const [payment] = params.paymentMist > 0n
    ? tx.splitCoins(tx.gas, [tx.pure(bcs.u64().serialize(params.paymentMist).toBytes())])
    : tx.splitCoins(tx.gas, [tx.pure(bcs.u64().serialize(0n).toBytes())]);

  tx.moveCall({
    target: `${params.packageId}::sui_a2a::send_message`,
    arguments: [
      tx.object(params.senderAgentCardId),
      tx.pure(bcs.Address.serialize(params.recipient).toBytes()),
      tx.pure(bcs.u8().serialize(params.intent).toBytes()),
      tx.pure(bcs.string().serialize(params.payloadBlob).toBytes()),
      payment,
      tx.pure(bcs.u64().serialize(params.ttlEpoch).toBytes()),
      tx.pure(bcs.bool().serialize(params.requiresAck).toBytes()),
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
 * Acknowledge a received message.
 */
export async function acknowledgeMessage(
  packageId: string,
  msgId: string,
  ackPayloadBlob: string,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_a2a::acknowledge`,
    arguments: [
      tx.object(msgId),
      tx.pure(bcs.string().serialize(ackPayloadBlob).toBytes()),
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
 * Fetch all AgentMessage objects owned by a given address.
 */
export async function getInbox(
  client: SuiClient,
  address: string,
  packageId: string
): Promise<AgentMessage[]> {
  const objs = await client.getOwnedObjects({
    owner: address,
    filter: {
      StructType: `${packageId}::sui_a2a::AgentMessage`,
    },
    options: { showContent: true },
  });

  const messages: AgentMessage[] = [];
  for (const obj of objs.data) {
    if (obj.data?.content?.dataType === "moveObject") {
      const f = obj.data.content.fields as Record<string, unknown>;
      messages.push(parseAgentMessage(obj.data.objectId, f));
    }
  }
  return messages;
}

/**
 * Fetch messages sent by an agent that are pending acknowledgement.
 */
export async function getPendingAcks(
  client: SuiClient,
  packageId: string,
  agentId: string
): Promise<AgentMessage[]> {
  const query = await client.queryEvents({
    query: {
      MoveEventType: `${packageId}::sui_a2a::MessageSent`,
    },
    limit: 50,
  });

  const messages: AgentMessage[] = [];
  for (const ev of query.data) {
    const evFields = ev.parsedJson as Record<string, unknown> | undefined;
    if (!evFields) continue;
    if (String(evFields["sender_id"] ?? "") !== agentId) continue;

    const msgId = String(evFields["msg_id"] ?? "");
    if (!msgId) continue;

    const obj = await client.getObject({ id: msgId, options: { showContent: true } });
    if (!obj.data?.content || obj.data.content.dataType !== "moveObject") continue;

    const f = obj.data.content.fields as Record<string, unknown>;
    const msg = parseAgentMessage(msgId, f);
    if (msg.requires_ack && !msg.acked) {
      messages.push(msg);
    }
  }
  return messages;
}

function parseAgentMessage(id: string, f: Record<string, unknown>): AgentMessage {
  const payFields = f["payment_attached"] as { fields?: { balance?: string } } | undefined;
  const payment = payFields?.fields?.balance ?? String(f["payment_attached"] ?? "0");

  return {
    id,
    sender_id: String(f["sender_id"] ?? ""),
    sender_address: String(f["sender_address"] ?? ""),
    recipient: String(f["recipient"] ?? ""),
    intent: Number(f["intent"] ?? 0) as MessageIntent,
    payload_blob: String(f["payload_blob"] ?? ""),
    payment_attached: payment,
    ttl_epoch: String(f["ttl_epoch"] ?? "0"),
    requires_ack: Boolean(f["requires_ack"]),
    acked: Boolean(f["acked"]),
  };
}
