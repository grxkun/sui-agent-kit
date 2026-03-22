// ─────────────────────────────────────────────────────────────────────────────
// examples/register-agent/index.ts
// Register an agent and create a delegation cap
// Run: npx ts-node examples/register-agent/index.ts
// ─────────────────────────────────────────────────────────────────────────────

import { SuiAgentKit } from '../../sdk/src/index.js';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

async function main() {
  const keypair = Ed25519Keypair.fromSecretKey(
    Uint8Array.from(Buffer.from(process.env.SUI_PRIVATE_KEY!, 'hex'))
  );

  const kit = new SuiAgentKit(keypair, {
    packageId: process.env.PACKAGE_ID!,
    agentRegistryId: process.env.AGENT_REGISTRY_ID!,
    taskBoardId: process.env.TASK_BOARD_ID!,
    network: 'testnet',
  });

  // Register
  console.log('📋 Registering agent...');
  const result = await kit.agents.register({
    name: 'DataBot v1',
    capabilities: ['data_analysis', 'trade', 'delegate'],
    endpointBlob: 'bafkreigh2akiscaild',
    mcpEndpoint: 'https://your-mcp.example.com/ika',
    x402Support: true,
  });

  const agentCardId = result.effects?.created?.[0]?.reference?.objectId;
  console.log('✅ Agent registered:', agentCardId);

  // Create delegation cap
  const client = new SuiClient({ url: getFullnodeUrl('testnet') });
  const { epoch } = await client.getLatestSuiSystemState();

  const capResult = await kit.policies.createCap({
    agentId: agentCardId!,
    allowedModules: ['deepbook', 'navi', 'cetus'],
    maxPerTx: 100_000_000n,
    dailyLimit: 1_000_000_000n,
    expiryEpoch: BigInt(Number(epoch) + 100),
    revocable: true,
  });

  const capId = capResult.effects?.created?.[0]?.reference?.objectId;
  console.log('✅ DelegationCap created:', capId);

  console.log('\n📌 Add to .env:');
  console.log(`AGENT_CARD_ID=${agentCardId}`);
  console.log(`DELEGATION_CAP_ID=${capId}`);
}

main().catch(console.error);
