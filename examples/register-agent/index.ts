/**
 * Example: Register an Agent on Sui
 *
 * 1. Create keypair from environment
 * 2. Register AgentCard with capabilities ["trade","data","delegate"]
 * 3. Create DelegationCap with 0.1 SUI max per tx
 * 4. Print agent ID and cap ID
 */

import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiAgentKit } from "../../sdk/src/index";

const PACKAGE_ID = process.env.PACKAGE_ID!;
const REGISTRY_ID = process.env.REGISTRY_ID!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;

async function main() {
  // 1. Create keypair from environment
  const keypair = Ed25519Keypair.fromSecretKey(PRIVATE_KEY);
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const kit = new SuiAgentKit(client, keypair, PACKAGE_ID);

  console.log("Registering agent...");
  console.log("Address:", keypair.toSuiAddress());

  // 2. Register AgentCard
  const registerResult = await kit.agents.register({
    registryId: REGISTRY_ID,
    name: "TradeDataAgent",
    capabilities: ["trade", "data", "delegate"],
    endpointBlob: "walrus://agent-card-metadata-blob-id",
    mcpEndpoint: "https://mcp.example.com/agent",
    x402Support: true,
  });

  // Extract agent ID from created objects
  const agentCreated = registerResult.objectChanges?.find(
    (c) => c.type === "created" && c.objectType.includes("AgentCard")
  );
  const agentId = agentCreated?.objectId;
  console.log("Agent registered! ID:", agentId);
  console.log("Transaction digest:", registerResult.digest);

  if (!agentId) {
    console.error("Failed to extract agent ID from transaction");
    return;
  }

  // 3. Create DelegationCap with 0.1 SUI max per tx
  const capResult = await kit.policies.createCap({
    agentId,
    allowedModules: ["payments", "tasks", "streams"],
    maxPerTx: 100_000_000, // 0.1 SUI in MIST
    dailyLimit: 1_000_000_000, // 1 SUI daily
    expiryEpoch: 999999,
    revocable: true,
  });

  const capCreated = capResult.objectChanges?.find(
    (c) => c.type === "created" && c.objectType.includes("DelegationCap")
  );
  const capId = capCreated?.objectId;

  // 4. Print results
  console.log("\n═══════════════════════════════════════");
  console.log("Agent Registration Complete!");
  console.log("═══════════════════════════════════════");
  console.log("Agent ID:        ", agentId);
  console.log("Delegation Cap ID:", capId);
  console.log("Owner:           ", keypair.toSuiAddress());
  console.log("Capabilities:     trade, data, delegate");
  console.log("Max per TX:       0.1 SUI");
  console.log("Daily limit:      1 SUI");
  console.log("═══════════════════════════════════════");

  // Verify the agent was created
  const agent = await kit.agents.get(agentId);
  if (agent) {
    console.log("\nVerification:");
    console.log("  Name:", agent.name);
    console.log("  Active:", agent.active);
    console.log("  Version:", agent.version);
    console.log("  x402 Support:", agent.x402Support);
    console.log("  Capabilities:", agent.capabilities.join(", "));
  }
}

main().catch(console.error);
