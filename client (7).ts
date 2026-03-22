// ─────────────────────────────────────────────────────────────────────────────
// memory.ts — Agent memory SDK (wraps sui_memory.move + Walrus upload)
// ─────────────────────────────────────────────────────────────────────────────

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import type { StoreMemoryParams, MemoryAnchor } from './types.js';

const CLOCK = '0x6';

function toBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

export async function storeMemory(
  params: StoreMemoryParams,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
) {
  const tx = new Transaction();

  const tagBytes = (params.tags ?? []).map((t) =>
    tx.pure.vector('u8', toBytes(t)),
  );

  tx.moveCall({
    target: `${packageId}::sui_memory::store_memory`,
    arguments: [
      // memoryIndex is resolved per-agent — caller must pass
      tx.pure.address(params.agentCardId),
      tx.pure.u8(params.memoryType),
      tx.pure.vector('u8', toBytes(params.blobId)),
      tx.pure.vector('u8', Array.from(params.contentHash)),
      tx.pure.bool(params.publicReadable ?? false),
      tx.makeMoveVec({ elements: tagBytes }),
      tx.object(CLOCK),
    ],
  });

  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
}

export async function getMemory(
  client: SuiClient,
  anchorId: string,
): Promise<MemoryAnchor | null> {
  try {
    const obj = await client.getObject({
      id: anchorId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      return null;
    }

    const f = obj.data.content.fields as Record<string, any>;
    return {
      id: anchorId,
      agentId: f.agent_id,
      memoryType: Number(f.memory_type),
      blobId: f.blob_id,
      contentHash: new Uint8Array(f.content_hash ?? []),
      epoch: BigInt(f.epoch),
      publicReadable: f.public_readable,
      tags: f.tags ?? [],
    };
  } catch {
    return null;
  }
}

export async function listAgentMemory(
  client: SuiClient,
  agentId: string,
  type?: number,
): Promise<MemoryAnchor[]> {
  // Query stored events for this agent
  const { data } = await client.queryEvents({
    query: { MoveEventType: `::sui_memory::MemoryStored` },
    limit: 100,
    order: 'descending',
  });

  const anchors: MemoryAnchor[] = [];
  for (const ev of data) {
    const fields = ev.parsedJson as Record<string, any>;
    if (fields.agent_id !== agentId) continue;
    if (type !== undefined && Number(fields.memory_type) !== type) continue;

    const anchor = await getMemory(client, fields.anchor_id);
    if (anchor) anchors.push(anchor);
  }

  return anchors;
}

export async function verifyMemoryIntegrity(
  client: SuiClient,
  anchorId: string,
  expectedHash: Uint8Array,
): Promise<boolean> {
  const anchor = await getMemory(client, anchorId);
  if (!anchor) return false;

  if (anchor.contentHash.length !== expectedHash.length) return false;
  return anchor.contentHash.every((b, i) => b === expectedHash[i]);
}

/**
 * Upload content to Walrus and return the blob ID.
 * Uses the Walrus publisher HTTP API.
 */
export async function uploadToWalrus(
  content: Uint8Array,
  epochs: number = 5,
): Promise<string> {
  const walrusUrl = process.env.WALRUS_PUBLISHER_URL ?? 'https://publisher.walrus-testnet.walrus.space';

  const response = await fetch(`${walrusUrl}/v1/blobs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: content,
  });

  if (!response.ok) {
    throw new Error(`Walrus upload failed: ${response.statusText}`);
  }

  const result = await response.json() as any;
  // Walrus returns either newlyCreated or alreadyCertified
  const blobInfo = result.newlyCreated ?? result.alreadyCertified;
  return blobInfo?.blobObject?.blobId ?? blobInfo?.blobId ?? '';
}
