// ─────────────────────────────────────────────────────────────────────────────
// agent.ts — Agent identity SDK (wraps sui_agent_id.move)
// ─────────────────────────────────────────────────────────────────────────────

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import type { RegisterAgentParams, AgentCard } from './types.js';

const CLOCK = '0x6';

function toBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

export async function registerAgent(
  params: RegisterAgentParams,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
) {
  const tx = new Transaction();

  const capBytes = params.capabilities.map((c) => tx.pure.vector('u8', toBytes(c)));

  tx.moveCall({
    target: `${packageId}::sui_agent_id::register`,
    arguments: [
      tx.object(/* registryId passed via config — caller wraps */),
      tx.pure.vector('u8', toBytes(params.name)),
      tx.makeMoveVec({ elements: capBytes }),
      tx.pure.vector('u8', toBytes(params.endpointBlob)),
      tx.pure.vector('u8', toBytes(params.mcpEndpoint ?? '')),
      tx.pure.bool(params.x402Support ?? false),
      tx.object(CLOCK),
    ],
  });

  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
}

export async function getAgent(
  client: SuiClient,
  agentId: string,
): Promise<AgentCard | null> {
  try {
    const obj = await client.getObject({
      id: agentId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      return null;
    }

    const f = obj.data.content.fields as Record<string, any>;
    return {
      id: agentId,
      owner: f.owner,
      name: f.name,
      version: BigInt(f.version),
      capabilities: f.capabilities?.contents ?? [],
      endpointBlob: f.endpoint_blob,
      mcpEndpoint: f.mcp_endpoint || null,
      x402Support: f.x402_support,
      active: f.active,
      createdAt: BigInt(f.created_at),
    };
  } catch {
    return null;
  }
}

export async function hasCapability(
  client: SuiClient,
  agentId: string,
  capability: string,
): Promise<boolean> {
  const agent = await getAgent(client, agentId);
  if (!agent) return false;
  return agent.capabilities.includes(capability);
}

export async function listAgentsByOwner(
  client: SuiClient,
  owner: string,
): Promise<AgentCard[]> {
  const { data } = await client.getOwnedObjects({
    owner,
    filter: { StructType: `${owner}::sui_agent_id::AgentCard` },
    options: { showContent: true },
  });

  return data
    .filter((o) => o.data?.content?.dataType === 'moveObject')
    .map((o) => {
      const f = (o.data!.content as any).fields;
      return {
        id: o.data!.objectId,
        owner: f.owner,
        name: f.name,
        version: BigInt(f.version),
        capabilities: f.capabilities?.contents ?? [],
        endpointBlob: f.endpoint_blob,
        mcpEndpoint: f.mcp_endpoint || null,
        x402Support: f.x402_support,
        active: f.active,
        createdAt: BigInt(f.created_at),
      };
    });
}
