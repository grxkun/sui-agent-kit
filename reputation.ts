// ─────────────────────────────────────────────────────────────────────────────
// a2a.ts — Agent-to-agent messaging SDK (wraps sui_a2a.move)
// ─────────────────────────────────────────────────────────────────────────────

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import type { SendMessageParams, AgentMessage } from './types.js';

const CLOCK = '0x6';

function toBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

export async function sendMessage(
  params: SendMessageParams,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
) {
  const tx = new Transaction();
  const paymentAmount = Number(params.paymentMist ?? 0n);
  const [payment] = tx.splitCoins(tx.gas, [paymentAmount]);

  tx.moveCall({
    target: `${packageId}::sui_a2a::send_message`,
    arguments: [
      tx.pure.address(params.senderAgentCardId),
      tx.pure.address(params.recipient),
      tx.pure.u8(params.intent),
      tx.pure.vector('u8', toBytes(params.payloadBlob)),
      payment,
      tx.pure.u64(params.ttlEpoch),
      tx.pure.bool(params.requiresAck ?? false),
      tx.object(CLOCK),
    ],
  });

  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
}

export async function acknowledgeMessage(
  msgId: string,
  payloadBlob: string,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_a2a::acknowledge`,
    arguments: [
      tx.object(msgId),
      tx.pure.vector('u8', toBytes(payloadBlob)),
      tx.object(CLOCK),
    ],
  });

  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true },
  });
}

export async function getInbox(
  client: SuiClient,
  address: string,
): Promise<AgentMessage[]> {
  const { data } = await client.getOwnedObjects({
    owner: address,
    filter: { StructType: `::sui_a2a::AgentMessage` },
    options: { showContent: true },
  });

  return data
    .filter((o) => o.data?.content?.dataType === 'moveObject')
    .map((o) => {
      const f = (o.data!.content as any).fields;
      return {
        id: o.data!.objectId,
        senderId: f.sender_id,
        recipient: f.recipient,
        intent: Number(f.intent),
        payloadBlob: f.payload_blob,
        paymentAttached: BigInt(f.payment_attached?.value ?? 0),
        ttlEpoch: BigInt(f.ttl_epoch),
        requiresAck: f.requires_ack,
        acked: f.acked,
      };
    });
}

export async function getPendingAcks(
  client: SuiClient,
  agentId: string,
): Promise<AgentMessage[]> {
  const inbox = await getInbox(client, agentId);
  return inbox.filter((msg) => msg.requiresAck && !msg.acked);
}
