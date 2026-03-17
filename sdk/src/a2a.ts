import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Keypair } from "@mysten/sui/cryptography";
import type {
  AgentMessage,
  MessageIntent,
  SendMessageParams,
  TransactionResult,
} from "./types";

const CLOCK_ID = "0x6";

export async function sendMessage(
  params: SendMessageParams & { packageId: string },
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();
  const [paymentCoin] = tx.splitCoins(tx.gas, [
    tx.pure.u64(params.paymentAmount),
  ]);

  tx.moveCall({
    target: `${params.packageId}::sui_a2a::send_message`,
    arguments: [
      tx.object(params.agentId),
      tx.pure.address(params.recipient),
      tx.pure.u8(params.intent),
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(params.payloadBlob))
      ),
      paymentCoin,
      tx.pure.u64(params.ttlEpoch),
      tx.pure.bool(params.requiresAck),
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

export async function acknowledgeMessage(
  msgId: string,
  payloadBlob: string,
  packageId: string,
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_a2a::acknowledge`,
    arguments: [
      tx.object(msgId),
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(payloadBlob))
      ),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return result as unknown as TransactionResult;
}

export async function rejectMessage(
  msgId: string,
  reasonBlob: string,
  packageId: string,
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_a2a::reject`,
    arguments: [
      tx.object(msgId),
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(reasonBlob))
      ),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return result as unknown as TransactionResult;
}

export async function getInbox(
  client: SuiClient,
  address: string,
  packageId: string
): Promise<AgentMessage[]> {
  const objects = await client.getOwnedObjects({
    owner: address,
    filter: {
      StructType: `${packageId}::sui_a2a::AgentMessage`,
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
      return parseMessage(fields, o.data!.objectId);
    });
}

export async function getPendingAcks(
  client: SuiClient,
  address: string,
  packageId: string
): Promise<AgentMessage[]> {
  const inbox = await getInbox(client, address, packageId);
  return inbox.filter((m) => m.requiresAck && !m.acked);
}

function parseMessage(
  fields: Record<string, unknown>,
  id: string
): AgentMessage {
  const paymentFields = fields["payment_attached"] as {
    fields?: { value?: string };
  };

  return {
    id,
    senderId: fields["sender_id"] as string,
    recipient: fields["recipient"] as string,
    intent: Number(fields["intent"]) as MessageIntent,
    payloadBlob: fields["payload_blob"] as string,
    paymentAttached: Number(paymentFields?.fields?.value ?? 0),
    ttlEpoch: Number(fields["ttl_epoch"]),
    requiresAck: fields["requires_ack"] as boolean,
    acked: fields["acked"] as boolean,
  };
}
