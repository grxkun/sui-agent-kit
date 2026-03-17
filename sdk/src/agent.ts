/**
 * agent.ts — SDK bindings for Module 1: sui_agent_id
 */
import {
  SuiClient,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import type { Keypair } from "@mysten/sui/cryptography";
import { bcs } from "@mysten/sui/bcs";
import type { AgentCard, TransactionResult } from "./types.js";

export interface RegisterAgentParams {
  packageId: string;
  registryId: string;
  clockId: string;
  name: string;
  capabilities: string[];
  endpointBlob: string;
  mcpEndpoint?: string;
  x402Support: boolean;
}

/**
 * Register a new AgentCard on-chain.
 */
export async function registerAgent(
  params: RegisterAgentParams,
  signer: Keypair & { toSuiAddress(): string },
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();

  const mcpOption = params.mcpEndpoint
    ? tx.moveCall({
        target: "0x1::option::some",
        typeArguments: ["0x1::string::String"],
        arguments: [tx.pure(bcs.string().serialize(params.mcpEndpoint).toBytes())],
      })
    : tx.moveCall({
        target: "0x1::option::none",
        typeArguments: ["0x1::string::String"],
        arguments: [],
      });

  tx.moveCall({
    target: `${params.packageId}::sui_agent_id::register_agent`,
    arguments: [
      tx.object(params.registryId),
      tx.pure(bcs.string().serialize(params.name).toBytes()),
      tx.pure(
        bcs.vector(bcs.string()).serialize(params.capabilities).toBytes()
      ),
      tx.pure(bcs.string().serialize(params.endpointBlob).toBytes()),
      mcpOption,
      tx.pure(bcs.bool().serialize(params.x402Support).toBytes()),
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
 * Fetch an AgentCard object by its on-chain ID.
 */
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
  return parseAgentCard(agentId, fields);
}

/**
 * Check whether an agent has a specific capability.
 */
export async function hasCapability(
  client: SuiClient,
  agentId: string,
  capability: string
): Promise<boolean> {
  const agent = await getAgent(client, agentId);
  if (!agent) return false;
  return agent.capabilities.includes(capability);
}

/**
 * List all AgentCard objects owned by a given address.
 */
export async function listAgentsByOwner(
  client: SuiClient,
  owner: string,
  packageId: string
): Promise<AgentCard[]> {
  const objs = await client.getOwnedObjects({
    owner,
    filter: {
      StructType: `${packageId}::sui_agent_id::AgentCard`,
    },
    options: { showContent: true },
  });

  const agents: AgentCard[] = [];
  for (const obj of objs.data) {
    if (obj.data?.content?.dataType === "moveObject") {
      const fields = obj.data.content.fields as Record<string, unknown>;
      agents.push(parseAgentCard(obj.data.objectId, fields));
    }
  }
  return agents;
}

function parseAgentCard(id: string, fields: Record<string, unknown>): AgentCard {
  const caps = fields["capabilities"] as { fields?: { contents?: string[] } } | string[] | undefined;
  const capList: string[] = Array.isArray(caps)
    ? caps
    : (caps?.fields?.contents ?? []);

  const mcpRaw = fields["mcp_endpoint"] as { fields?: { vec?: string[] } } | null | undefined;
  const mcpEndpoint: string | null = mcpRaw?.fields?.vec?.[0] ?? null;

  return {
    id,
    owner: String(fields["owner"] ?? ""),
    name: String(fields["name"] ?? ""),
    version: String(fields["version"] ?? "0"),
    capabilities: capList,
    endpoint_blob: String(fields["endpoint_blob"] ?? ""),
    mcp_endpoint: mcpEndpoint,
    x402_support: Boolean(fields["x402_support"]),
    active: Boolean(fields["active"]),
    created_at: String(fields["created_at"] ?? "0"),
  };
}
