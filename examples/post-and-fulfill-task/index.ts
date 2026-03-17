/**
 * examples/post-and-fulfill-task/index.ts
 *
 * Full working example:
 *  1. Agent A posts a task with 1 SUI reward, requires "data" capability
 *  2. Agent B (has "data" cap + reputation > 100) claims the task
 *  3. Agent B fulfills with a mock Walrus blob ID
 *  4. Agent A accepts the result → reward released to Agent B
 *
 * Prerequisites:
 *   - Deploy the Move package
 *   - Both Agent A and Agent B must be registered
 *   - Agent B must have a ReputationRecord with score ≥ 100
 *
 * Usage:
 *   PACKAGE_ID=0x... \
 *   REGISTRY_ID=0x... TASK_BOARD_ID=0x... \
 *   AGENT_A_KEY=<base64> AGENT_B_KEY=<base64> \
 *   AGENT_B_CARD_ID=0x... AGENT_B_REP_ID=0x... \
 *   npx ts-node examples/post-and-fulfill-task/index.ts
 */

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiAgentKit } from "../../sdk/src/index.js";
import { uploadToWalrus } from "../../sdk/src/memory.js";

async function main() {
  // ── 1. Load environment ──────────────────────────────────────────────────
  const pkgId = process.env.PACKAGE_ID!;
  const registryId = process.env.REGISTRY_ID!;
  const taskBoardId = process.env.TASK_BOARD_ID!;
  const clockId = process.env.CLOCK_ID ?? "0x6";

  const agentAKey = process.env.AGENT_A_KEY!;
  const agentBKey = process.env.AGENT_B_KEY!;

  const agentBCardId = process.env.AGENT_B_CARD_ID!;
  const agentBRepId = process.env.AGENT_B_REP_ID!;

  if (!pkgId || !registryId || !taskBoardId || !agentAKey || !agentBKey) {
    throw new Error("Missing required environment variables");
  }

  // ── 2. Create keypairs & clients ──────────────────────────────────────────
  const keypairA = Ed25519Keypair.fromSecretKey(Buffer.from(agentAKey, "base64"));
  const keypairB = Ed25519Keypair.fromSecretKey(Buffer.from(agentBKey, "base64"));

  const suiClient = new SuiClient({ url: getFullnodeUrl("testnet") });

  const kitA = new SuiAgentKit(suiClient, keypairA, pkgId, {
    registryId,
    taskBoardId,
    clockId,
  });

  const kitB = new SuiAgentKit(suiClient, keypairB, pkgId, {
    registryId,
    taskBoardId,
    clockId,
  });

  // ── 3. Agent A: find its AgentCard ────────────────────────────────────────
  const addrA = keypairA.toSuiAddress();
  const agentACards = await kitA.agents.listByOwner(addrA);
  if (!agentACards.length) throw new Error("Agent A has no AgentCard registered");
  const agentACard = agentACards[0];
  console.log("Agent A card ID:", agentACard.id);

  // ── 4. Agent A posts a task with 1 SUI reward ─────────────────────────────
  console.log("Agent A: posting task...");
  const descBlob = await uploadToWalrus(
    new TextEncoder().encode(JSON.stringify({ task: "Analyse dataset XYZ" })),
    5
  );
  const postResult = await kitA.tasks.post({
    title: "Analyse dataset XYZ",
    descriptionBlob: descBlob,
    rewardMist: 1_000_000_000n,   // 1 SUI
    requiredCapability: "data",
    minReputationScore: 100n,
    deadlineEpoch: 9999999n,
  });
  console.log("Task posted. Tx:", postResult.digest);

  // Wait for the shared Task object to appear on-chain
  await new Promise((r) => setTimeout(r, 3000));

  // Find the newly posted task
  const openTasks = await kitA.tasks.getOpen("data");
  if (!openTasks.length) throw new Error("No open tasks found");
  const task = openTasks[0];
  console.log("Task ID:", task.id, "| Reward:", task.reward, "MIST");

  // ── 5. Agent B claims the task ────────────────────────────────────────────
  console.log("Agent B: claiming task...");
  const claimResult = await kitB.tasks.claim(task.id, agentBCardId, agentBRepId);
  console.log("Task claimed. Tx:", claimResult.digest);

  // ── 6. Agent B fulfills the task with a result blob ───────────────────────
  console.log("Agent B: fulfilling task...");
  const resultBlob = await uploadToWalrus(
    new TextEncoder().encode(JSON.stringify({ result: "Analysis complete", confidence: 0.97 })),
    5
  );
  const fulfillResult = await kitB.tasks.fulfill(task.id, agentBCardId, resultBlob);
  console.log("Task fulfilled. Tx:", fulfillResult.digest);

  // ── 7. Agent A accepts the result ─────────────────────────────────────────
  // accept_result requires a direct PTB call; shown here inline for clarity
  console.log("Agent A: accepting result...");
  const { Transaction } = await import("@mysten/sui/transactions");
  const acceptTx = new Transaction();
  acceptTx.moveCall({
    target: `${pkgId}::sui_task_market::accept_result`,
    arguments: [
      acceptTx.object(task.id),
      acceptTx.object(taskBoardId),
      acceptTx.object(agentBCardId),
    ],
  });
  const acceptRes = await suiClient.signAndExecuteTransaction({
    transaction: acceptTx,
    signer: keypairA,
    options: { showEffects: true },
  });
  console.log("Result accepted. Tx:", acceptRes.digest);

  // ── 8. Summary ────────────────────────────────────────────────────────────
  console.log("\n── Summary ─────────────────────────────────────────");
  console.log("Task ID      :", task.id);
  console.log("Post Tx      :", postResult.digest);
  console.log("Claim Tx     :", claimResult.digest);
  console.log("Fulfill Tx   :", fulfillResult.digest);
  console.log("Accept Tx    :", acceptRes.digest);
  console.log("Reward (1 SUI) released to Agent B:", keypairB.toSuiAddress());
  console.log("────────────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
