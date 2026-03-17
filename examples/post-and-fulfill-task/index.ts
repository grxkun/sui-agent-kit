/**
 * Example: Post and Fulfill a Task
 *
 * 1. Agent A posts a task with 1 SUI reward, requires "data" capability
 * 2. Agent B (has "data" cap + reputation > 100) claims the task
 * 3. Agent B fulfills with a mock Walrus blob ID
 * 4. Agent A accepts result → reward released
 */

import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiAgentKit } from "../../sdk/src/index";

const PACKAGE_ID = process.env.PACKAGE_ID!;
const BOARD_ID = process.env.BOARD_ID!;

// Two separate agents
const AGENT_A_KEY = process.env.AGENT_A_PRIVATE_KEY!;
const AGENT_B_KEY = process.env.AGENT_B_PRIVATE_KEY!;
const AGENT_B_CARD_ID = process.env.AGENT_B_CARD_ID!;
const AGENT_B_REPUTATION_ID = process.env.AGENT_B_REPUTATION_ID!;

async function main() {
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });

  // Setup Agent A (task poster)
  const keypairA = Ed25519Keypair.fromSecretKey(AGENT_A_KEY);
  const kitA = new SuiAgentKit(client, keypairA, PACKAGE_ID);

  // Setup Agent B (task fulfiller)
  const keypairB = Ed25519Keypair.fromSecretKey(AGENT_B_KEY);
  const kitB = new SuiAgentKit(client, keypairB, PACKAGE_ID);

  console.log("Agent A:", keypairA.toSuiAddress());
  console.log("Agent B:", keypairB.toSuiAddress());

  // ─────────────────────────────────────────
  // STEP 1: Agent A posts a task
  // ─────────────────────────────────────────
  console.log("\n[Step 1] Agent A posting task...");

  const postResult = await kitA.tasks.post({
    boardId: BOARD_ID,
    title: "Analyze DeFi Trading Data",
    descriptionBlob: "walrus://task-description-blob-12345",
    rewardAmount: 1_000_000_000, // 1 SUI
    requiredCapability: "data",
    minReputationScore: 100,
    deadlineEpoch: 999999,
  });

  const taskCreated = postResult.objectChanges?.find(
    (c) => c.type === "created" && c.objectType.includes("Task")
  );
  const taskId = taskCreated?.objectId;
  console.log("Task posted! ID:", taskId);
  console.log("Reward: 1 SUI | Required cap: data | Min rep: 100");

  if (!taskId) {
    console.error("Failed to extract task ID");
    return;
  }

  // ─────────────────────────────────────────
  // STEP 2: Agent B claims the task
  // ─────────────────────────────────────────
  console.log("\n[Step 2] Agent B claiming task...");

  const claimResult = await kitB.tasks.claim(
    taskId,
    AGENT_B_CARD_ID,
    AGENT_B_REPUTATION_ID
  );
  console.log("Task claimed! Digest:", claimResult.digest);

  // ─────────────────────────────────────────
  // STEP 3: Agent B fulfills with result blob
  // ─────────────────────────────────────────
  console.log("\n[Step 3] Agent B fulfilling task...");

  const resultBlobId = "walrus://analysis-result-blob-67890";

  const fulfillResult = await kitB.tasks.fulfill(
    taskId,
    AGENT_B_CARD_ID,
    resultBlobId
  );
  console.log("Task fulfilled! Digest:", fulfillResult.digest);
  console.log("Result blob:", resultBlobId);

  // ─────────────────────────────────────────
  // STEP 4: Agent A accepts → reward released
  // ─────────────────────────────────────────
  console.log("\n[Step 4] Agent A accepting result...");

  const acceptResult = await kitA.tasks.accept(taskId);
  console.log("Result accepted! Digest:", acceptResult.digest);

  // ─────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────
  console.log("\n═══════════════════════════════════════");
  console.log("Task Lifecycle Complete!");
  console.log("═══════════════════════════════════════");
  console.log("Task ID:      ", taskId);
  console.log("Posted by:     Agent A", keypairA.toSuiAddress());
  console.log("Fulfilled by:  Agent B", keypairB.toSuiAddress());
  console.log("Reward:        1 SUI released to Agent B");
  console.log("Result:       ", resultBlobId);
  console.log("═══════════════════════════════════════");
}

main().catch(console.error);
