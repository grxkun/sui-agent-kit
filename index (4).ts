// ─────────────────────────────────────────────────────────────────────────────
// examples/post-and-fulfill-task/index.ts
// Post a task, claim it, fulfill it, and accept the result
// Run: npx ts-node examples/post-and-fulfill-task/index.ts
// ─────────────────────────────────────────────────────────────────────────────

import { SuiAgentKit, MessageIntent } from '../../sdk/src/index.js';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

async function main() {
  const keypairA = Ed25519Keypair.fromSecretKey(
    Uint8Array.from(Buffer.from(process.env.SUI_PRIVATE_KEY!, 'hex'))
  );

  const kit = new SuiAgentKit(keypairA, {
    packageId: process.env.PACKAGE_ID!,
    agentRegistryId: process.env.AGENT_REGISTRY_ID!,
    taskBoardId: process.env.TASK_BOARD_ID!,
    network: 'testnet',
  });

  // 1. Post a task
  console.log('📋 Posting task...');
  const postResult = await kit.tasks.post({
    title: 'Analyze Trading Data',
    descriptionBlob: 'walrus://task-desc-blob-id',
    rewardMist: 1_000_000_000n, // 1 SUI
    requiredCapability: 'data_analysis',
    minReputationScore: 100n,
    deadlineEpoch: 999999n,
  });

  const taskId = postResult.effects?.created?.[0]?.reference?.objectId;
  console.log('✅ Task posted:', taskId);

  // 2. Claim the task (in production, a different agent does this)
  console.log('\n🤖 Claiming task...');
  await kit.tasks.claim(
    taskId!,
    process.env.AGENT_CARD_ID!,
    process.env.REPUTATION_RECORD_ID!,
  );
  console.log('✅ Task claimed');

  // 3. Fulfill with result
  console.log('\n📤 Fulfilling task...');
  await kit.tasks.fulfill(taskId!, 'walrus://analysis-result-blob');
  console.log('✅ Task fulfilled');

  // 4. Accept the result (poster)
  console.log('\n✅ Accepting result...');
  await kit.tasks.accept(taskId!);
  console.log('🎉 Reward released!');

  // 5. Send a message to another agent
  console.log('\n💬 Sending A2A message...');
  await kit.messages.send({
    senderAgentCardId: process.env.AGENT_CARD_ID!,
    recipient: '0x<other_agent_address>',
    intent: MessageIntent.Request,
    payloadBlob: 'walrus://request-payload',
    paymentMist: 500_000_000n,
    ttlEpoch: 100n,
    requiresAck: true,
  });
  console.log('✅ Message sent');
}

main().catch(console.error);
