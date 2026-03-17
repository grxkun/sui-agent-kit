/**
 * memory.ts — SDK bindings for Module 8: sui_memory
 * Also exports a Walrus upload helper (stub — replace with real Walrus client).
 */
import {
  SuiClient,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import type { Keypair } from "@mysten/sui/cryptography";
import { bcs } from "@mysten/sui/bcs";
import type { MemoryAnchor, MemoryType, TransactionResult } from "./types.js";

export interface StoreMemoryParams {
  packageId: string;
  clockId: string;
  agentCardId: string;
  memoryType: MemoryType;
  blobId: string;
  contentHash: Uint8Array;
  publicReadable: boolean;
  tags: string[];
}

/**
 * Store a new MemoryAnchor on-chain pointing to a Walrus blob.
 */
export async function storeMemory(
  params: StoreMemoryParams,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::sui_memory::store_memory`,
    arguments: [
      tx.object(params.agentCardId),
      tx.pure(bcs.u8().serialize(params.memoryType).toBytes()),
      tx.pure(bcs.string().serialize(params.blobId).toBytes()),
      tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(params.contentHash)).toBytes()),
      tx.pure(bcs.bool().serialize(params.publicReadable).toBytes()),
      tx.pure(bcs.vector(bcs.string()).serialize(params.tags).toBytes()),
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
 * Fetch a MemoryAnchor by its on-chain ID.
 */
export async function getMemory(
  client: SuiClient,
  anchorId: string
): Promise<MemoryAnchor | null> {
  const obj = await client.getObject({
    id: anchorId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return null;
  }

  const f = obj.data.content.fields as Record<string, unknown>;
  return parseAnchor(anchorId, f);
}

/**
 * List all MemoryAnchor objects for a given agent (from on-chain events).
 */
export async function listAgentMemory(
  client: SuiClient,
  packageId: string,
  agentId: string,
  type?: MemoryType
): Promise<MemoryAnchor[]> {
  const query = await client.queryEvents({
    query: {
      MoveEventType: `${packageId}::sui_memory::MemoryStored`,
    },
    limit: 50,
  });

  const anchors: MemoryAnchor[] = [];
  for (const ev of query.data) {
    const evFields = ev.parsedJson as Record<string, unknown> | undefined;
    if (!evFields) continue;
    if (String(evFields["agent_id"] ?? "") !== agentId) continue;
    if (type !== undefined && Number(evFields["memory_type"]) !== type) continue;

    const anchorId = String(evFields["anchor_id"] ?? "");
    if (!anchorId) continue;

    const anchor = await getMemory(client, anchorId);
    if (anchor) anchors.push(anchor);
  }
  return anchors;
}

/**
 * Verify a memory anchor's content hash locally (off-chain).
 */
export async function verifyMemoryIntegrity(
  client: SuiClient,
  anchorId: string,
  hash: Uint8Array
): Promise<boolean> {
  const anchor = await getMemory(client, anchorId);
  if (!anchor) return false;
  const anchorHash = anchor.content_hash;
  if (anchorHash.length !== hash.length) return false;
  return anchorHash.every((b, i) => b === hash[i]);
}

/**
 * Upload content to Walrus and return the blob ID.
 *
 * NOTE: This is a stub implementation.  Replace with the real Walrus SDK
 * (https://sdk.walrus.site) once available in your environment.
 */
export async function uploadToWalrus(
  content: Uint8Array,
  _epochs: number
): Promise<string> {
  // In a real deployment, call the Walrus publisher endpoint, e.g.:
  //   const res = await fetch(`${WALRUS_PUBLISHER_URL}/v1/store?epochs=${_epochs}`, {
  //     method: "PUT", body: content,
  //   });
  //   const json = await res.json();
  //   return json.newlyCreated?.blobObject?.blobId ?? json.alreadyCertified?.blobId;

  // Stub: return a deterministic fake CID based on content length.
  const hashHex = Array.from(content.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `bafybei${hashHex}stub`;
}

function parseAnchor(id: string, f: Record<string, unknown>): MemoryAnchor {
  const tagsRaw = f["tags"] as { fields?: { contents?: string[] } } | string[] | undefined;
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw
    : (tagsRaw?.fields?.contents ?? []);

  const hashRaw = f["content_hash"] as number[] | undefined;

  return {
    id,
    agent_id: String(f["agent_id"] ?? ""),
    memory_type: Number(f["memory_type"] ?? 0) as MemoryType,
    blob_id: String(f["blob_id"] ?? ""),
    content_hash: hashRaw ?? [],
    epoch: String(f["epoch"] ?? "0"),
    public_readable: Boolean(f["public_readable"]),
    tags,
  };
}
