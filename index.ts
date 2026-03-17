import { SuiAgentKit } from '@sui-agent-kit/sdk';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

// ─────────────────────────────────────────────────────────────────────────────
// Example 1: Register an agent + create a delegation cap
// Run: npx ts-node examples/register-agent/index.ts
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load keypair from env (never commit a real key)
  const keypair = Ed25519Keypair.fromSecretKey(
    Uint8Array.from(Buffer.from(process.env.SUI_PRIVATE_KEY!, 'hex'))
  );

  const address = keypair.toSuiAddress();
  console.log('🔑 Wallet:', address);

  // 2. Init the kit
  const kit = new SuiAgentKit(keypair, {
    packageId:       process.env.PACKAGE_ID!,
    agentRegistryId: process.env.AGENT_REGISTRY_ID!,
    taskBoardId:     process.env.TASK_BOARD_ID!,
    network:         'testnet',
  });

  // 3. Register the agent on-chain
  console.log('\n📋 Registering agent...');
  const registerResult = await kit.agents.register({
    name:         'DataBot v1',
    capabilities: ['data_analysis', 'trade', 'delegate'],
    endpointBlob: 'bafkreigh2akiscaild',   // Walrus CID of your AgentCard JSON
    mcpEndpoint:  'https://your-mcp.example.com/ika',
    x402Support:  true,
  });

  console.log('✅ Agent registered!');
  console.log('   Tx digest:', registerResult.digest);

  // Extract the AgentCard object ID from effects
  const agentCardId = registerResult.effects?.created?.[0]?.reference?.objectId;
  console.log('   AgentCard ID:', agentCardId);

  // 4. Fetch and display the agent
  const agent = await kit.agents.get(agentCardId!);
  console.log('\n🤖 Agent on-chain:');
  console.log('   Name:', agent?.name);
  console.log('   Capabilities:', agent?.capabilities.join(', '));
  console.log('   x402 support:', agent?.x402Support);

  // 5. Create a delegation cap — limits what the agent can do on your behalf
  console.log('\n🔐 Creating delegation cap...');
  const client = new SuiClient({ url: getFullnodeUrl('testnet') });
  const { epoch } = await client.getLatestSuiSystemState();

  const capResult = await kit.policies.createCap({
    agentId:        agentCardId!,
    allowedModules: ['deepbook', 'navi', 'cetus'],
    maxPerTx:       100_000_000n,            // 0.1 SUI per transaction
    dailyLimit:     1_000_000_000n,          // 1 SUI per day
    expiryEpoch:    BigInt(Number(epoch) + 100),
    revocable:      true,
  });

  console.log('✅ Delegation cap created!');
  console.log('   Tx digest:', capResult.digest);

  const capId = capResult.effects?.created?.[0]?.reference?.objectId;
  console.log('   DelegationCap ID:', capId);

  // 6. Check authorization
  const canTrade = await kit.policies.checkAuthorization(
    capId!,
    'deepbook',
    50_000_000n   // 0.05 SUI — within the per-tx cap
  );
  console.log('\n🔍 Can agent trade on DeepBook for 0.05 SUI?', canTrade ? 'YES ✅' : 'NO ❌');

  console.log('\n📌 Save these IDs to your .env:');
  console.log(`   AGENT_CARD_ID=${agentCardId}`);
  console.log(`   DELEGATION_CAP_ID=${capId}`);
}

main().catch(console.error);
