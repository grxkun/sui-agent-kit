import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Keypair } from "@mysten/sui/cryptography";
import type {
  DelegationCap,
  CreateDelegationCapParams,
  TransactionResult,
} from "./types";

const CLOCK_ID = "0x6";

export async function createDelegationCap(
  params: CreateDelegationCapParams & { packageId: string },
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::sui_agent_policy::create_cap`,
    arguments: [
      tx.pure.id(params.agentId),
      tx.pure.vector(
        "vector<u8>",
        params.allowedModules.map((m) =>
          Array.from(new TextEncoder().encode(m))
        )
      ),
      tx.pure.u64(params.maxPerTx),
      tx.pure.u64(params.dailyLimit),
      tx.pure.u64(params.expiryEpoch),
      tx.pure.bool(params.revocable),
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

export async function revokeCap(
  capId: string,
  packageId: string,
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_agent_policy::revoke_cap`,
    arguments: [tx.object(capId)],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return result as unknown as TransactionResult;
}

export async function getCap(
  client: SuiClient,
  capId: string
): Promise<DelegationCap | null> {
  const obj = await client.getObject({
    id: capId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return null;
  }

  const fields = obj.data.content.fields as Record<string, unknown>;
  const modules = fields["allowed_modules"] as {
    fields?: { contents?: string[] };
  };

  return {
    id: capId,
    agentId: fields["agent_id"] as string,
    delegator: fields["delegator"] as string,
    allowedModules: modules?.fields?.contents ?? [],
    maxPerTx: Number(fields["max_per_tx"]),
    dailyLimit: Number(fields["daily_limit"]),
    expiryEpoch: Number(fields["expiry_epoch"]),
    revocable: fields["revocable"] as boolean,
    active: fields["active"] as boolean,
  };
}

export async function checkAuthorization(
  client: SuiClient,
  capId: string,
  moduleName: string,
  amount: number
): Promise<boolean> {
  const cap = await getCap(client, capId);
  if (!cap || !cap.active) return false;
  if (!cap.allowedModules.includes(moduleName)) return false;
  if (amount > cap.maxPerTx) return false;
  return true;
}
