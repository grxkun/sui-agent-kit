/**
 * examples/register-agent/index.ts
 *
 * Full working example:
 *  1. Create a keypair from the PRIVATE_KEY env var
 *  2. Register an AgentCard with capabilities ["trade","data","delegate"]
 *  3. Create a DelegationCap with 0.1 SUI max per tx
 *  4. Print the agent ID and cap ID
 *
 * Prerequisites:
 *   - Deploy the Move package and set PACKAGE_ID, REGISTRY_ID, CLOCK_ID
 *   - Fund the address with test SUI (sui client faucet)
 *
 * Usage:
 *   PRIVATE_KEY=<base64-encoded-key> \
 *   PACKAGE_ID=0x... REGISTRY_ID=0x... \
 *   npx ts-node examples/register-agent/index.ts
 */

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiAgentKit } from "../../sdk/src/index.js";

async function main() {
  // ── 1. Load environment ──────────────────────────────────────────────────
  const privateKey = process.env.PRIVATE_KEY;
  const packageId = process.env.PACKAGE_ID;
  const registryId = process.env.REGISTRY_ID;
  const taskBoardId = process.env.TASK_BOARD_ID ?? "0x0"; // placeholder
  const clockId = process.env.CLOCK_ID ?? "0x6";          // Sui system clock

  if (!privateKey || !packageId || !registryId) {
    throw new Error(
      "Missing required environment variables: PRIVATE_KEY, PACKAGE_ID, REGISTRY_ID"
    );
  }

  // ── 2. Create keypair ────────────────────────────────────────────────────
  const keypair = Ed25519Keypair.fromSecretKey(
    Buffer.from(privateKey, "base64")
  );
  const address = keypair.toSuiAddress();
  console.log("Wallet address:", address);

  // ── 3. Initialise client ─────────────────────────────────────────────────
  const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });
  const kit = new SuiAgentKit(suiClient, keypair, packageId, {
    registryId,
    taskBoardId,
    clockId,
  });

  // ── 4. Register AgentCard ─────────────────────────────────────────────────
  console.log("Registering agent...");
  const registerResult = await kit.agents.register({
    name: "MyAgent",
    capabilities: ["trade", "data", "delegate"],
    endpointBlob: "bafybeiexamplewalrusblobid",
    mcpEndpoint: "https://mcp.example.com/agent",
    x402Support: true,
  });
  console.log("Agent registered. Tx digest:", registerResult.digest);

  // Wait for indexer to catch up then find the new AgentCard
  await new Promise((r) => setTimeout(r, 3000));
  const agents = await kit.agents.listByOwner(address);
  const agent = agents[0];
  if (!agent) {
    throw new Error("AgentCard not found after registration");
  }
  console.log("Agent ID:", agent.id);

  // ── 5. Create DelegationCap (0.1 SUI = 100_000_000 MIST max per tx) ──────
  console.log("Creating DelegationCap...");
  const capResult = await kit.policies.create({
    agentId: agent.id,
    allowedModules: ["sui_x402", "sui_task_market"],
    maxPerTx: 100_000_000n,         // 0.1 SUI
    dailyLimit: 1_000_000_000n,     // 1 SUI per day
    expiryEpoch: 999999n,
    revocable: true,
  });
  console.log("DelegationCap created. Tx digest:", capResult.digest);

  // ── 6. Print summary ──────────────────────────────────────────────────────
  console.log("\n── Summary ─────────────────────────────────────────");
  console.log("Agent ID :", agent.id);
  console.log("Cap Tx   :", capResult.digest);
  console.log("────────────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
