import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Keypair } from "@mysten/sui/cryptography";
import type {
  AgentCard,
  RegisterAgentParams,
  TransactionResult,
} from "./types";

const CLOCK_ID = "0x6";

export async function registerAgent(
  params: RegisterAgentParams & { packageId: string },
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::sui_agent_id::register_agent`,
    arguments: [
      tx.object(params.registryId),
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(params.name))),
      tx.pure.vector(
        "vector<u8>",
        params.capabilities.map((c) => Array.from(new TextEncoder().encode(c)))
      ),
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(params.endpointBlob))
      ),
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(params.mcpEndpoint ?? ""))
      ),
      tx.pure.bool(params.x402Support),
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

export async function getAgent(
  client: SuiClient,
  agentId: string
): Promise<AgentCard | null> {
  const obj = await client.getObject({
    id: agentId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return null;
  }

  const fields = obj.data.content.fields as Record<string, unknown>;
  return parseAgentCard(fields, agentId);
}

export async function hasCapability(
  client: SuiClient,
  agentId: string,
  capability: string
): Promise<boolean> {
  const agent = await getAgent(client, agentId);
  if (!agent) return false;
  return agent.capabilities.includes(capability);
}

export async function listAgentsByOwner(
  client: SuiClient,
  owner: string,
  packageId: string
): Promise<AgentCard[]> {
  const objects = await client.getOwnedObjects({
    owner,
    filter: {
      StructType: `${packageId}::sui_agent_id::AgentCard`,
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
      return parseAgentCard(fields, o.data!.objectId);
    });
}

function parseAgentCard(
  fields: Record<string, unknown>,
  id: string
): AgentCard {
  const caps = fields["capabilities"] as { fields?: { contents?: string[] } };
  return {
    id,
    owner: fields["owner"] as string,
    name: fields["name"] as string,
    version: Number(fields["version"]),
    capabilities: caps?.fields?.contents ?? [],
    endpointBlob: fields["endpoint_blob"] as string,
    mcpEndpoint: (fields["mcp_endpoint"] as string) || null,
    x402Support: fields["x402_support"] as boolean,
    active: fields["active"] as boolean,
    createdAt: Number(fields["created_at"]),
  };
}
