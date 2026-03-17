import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Keypair } from "@mysten/sui/cryptography";
import type {
  MemoryAnchor,
  MemoryType,
  StoreMemoryParams,
  TransactionResult,
} from "./types";

const CLOCK_ID = "0x6";

export async function storeMemory(
  params: StoreMemoryParams & { packageId: string },
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::sui_memory::store_memory`,
    arguments: [
      tx.object(params.agentId),
      tx.object(params.indexId),
      tx.pure.u8(params.memoryType),
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(params.blobId))
      ),
      tx.pure.vector("u8", Array.from(params.contentHash)),
      tx.pure.bool(params.publicReadable),
      tx.pure.vector(
        "vector<u8>",
        params.tags.map((t) => Array.from(new TextEncoder().encode(t)))
      ),
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

  const fields = obj.data.content.fields as Record<string, unknown>;
  return parseMemoryAnchor(fields, anchorId);
}

export async function listAgentMemory(
  client: SuiClient,
  owner: string,
  packageId: string,
  memoryType?: MemoryType
): Promise<MemoryAnchor[]> {
  const objects = await client.getOwnedObjects({
    owner,
    filter: {
      StructType: `${packageId}::sui_memory::MemoryAnchor`,
    },
    options: { showContent: true },
  });

  const anchors = objects.data
    .filter(
      (o) => o.data?.content && o.data.content.dataType === "moveObject"
    )
    .map((o) => {
      const fields = (o.data!.content as { fields: Record<string, unknown> })
        .fields;
      return parseMemoryAnchor(fields, o.data!.objectId);
    });

  if (memoryType !== undefined) {
    return anchors.filter((a) => a.memoryType === memoryType);
  }

  return anchors;
}

export async function verifyMemoryIntegrity(
  client: SuiClient,
  anchorId: string,
  hash: Uint8Array
): Promise<boolean> {
  const anchor = await getMemory(client, anchorId);
  if (!anchor) return false;
  if (anchor.contentHash.length !== hash.length) return false;
  for (let i = 0; i < hash.length; i++) {
    if (anchor.contentHash[i] !== hash[i]) return false;
  }
  return true;
}

/**
 * Upload content to Walrus decentralized storage and return the blob ID.
 * This is a helper that wraps the Walrus publisher API.
 */
export async function uploadToWalrus(
  content: Uint8Array,
  epochs: number,
  publisherUrl = "https://publisher.walrus-testnet.walrus.space"
): Promise<string> {
  const response = await fetch(
    `${publisherUrl}/v1/blobs?epochs=${epochs}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: content,
    }
  );

  if (!response.ok) {
    throw new Error(
      `Walrus upload failed: ${response.status} ${response.statusText}`
    );
  }

  const result = (await response.json()) as {
    newlyCreated?: { blobObject?: { blobId?: string } };
    alreadyCertified?: { blobId?: string };
  };

  const blobId =
    result.newlyCreated?.blobObject?.blobId ??
    result.alreadyCertified?.blobId;

  if (!blobId) {
    throw new Error("Failed to extract blob ID from Walrus response");
  }

  return blobId;
}

function parseMemoryAnchor(
  fields: Record<string, unknown>,
  id: string
): MemoryAnchor {
  const tags = fields["tags"] as { fields?: { contents?: string[] } };
  const hashRaw = fields["content_hash"] as number[] | Uint8Array;

  return {
    id,
    agentId: fields["agent_id"] as string,
    memoryType: Number(fields["memory_type"]) as MemoryType,
    blobId: fields["blob_id"] as string,
    contentHash: hashRaw instanceof Uint8Array ? hashRaw : new Uint8Array(hashRaw ?? []),
    epoch: Number(fields["epoch"]),
    publicReadable: fields["public_readable"] as boolean,
    tags: tags?.fields?.contents ?? [],
  };
}
