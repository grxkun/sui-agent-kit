import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Keypair } from "@mysten/sui/cryptography";
import type {
  PaymentStream,
  OpenStreamParams,
  TransactionResult,
} from "./types";

const CLOCK_ID = "0x6";

export async function openStream(
  params: OpenStreamParams & { packageId: string },
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();
  const [depositCoin] = tx.splitCoins(tx.gas, [
    tx.pure.u64(params.initialDeposit),
  ]);

  tx.moveCall({
    target: `${params.packageId}::sui_stream::open_stream`,
    arguments: [
      tx.pure.address(params.payee),
      tx.pure.u64(params.ratePerEpoch),
      depositCoin,
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

export async function claimStream(
  streamId: string,
  packageId: string,
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_stream::claim`,
    arguments: [tx.object(streamId), tx.object(CLOCK_ID)],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return result as unknown as TransactionResult;
}

export async function topUp(
  streamId: string,
  amount: number,
  packageId: string,
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);

  tx.moveCall({
    target: `${packageId}::sui_stream::top_up`,
    arguments: [tx.object(streamId), coin],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return result as unknown as TransactionResult;
}

export async function closeStream(
  streamId: string,
  packageId: string,
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_stream::close`,
    arguments: [tx.object(streamId), tx.object(CLOCK_ID)],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return result as unknown as TransactionResult;
}

export async function getStreamBalance(
  client: SuiClient,
  streamId: string
): Promise<number> {
  const stream = await getStream(client, streamId);
  return stream?.balance ?? 0;
}

export async function getStream(
  client: SuiClient,
  streamId: string
): Promise<PaymentStream | null> {
  const obj = await client.getObject({
    id: streamId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return null;
  }

  const fields = obj.data.content.fields as Record<string, unknown>;
  const balanceFields = fields["balance"] as { fields?: { value?: string } };

  return {
    id: streamId,
    payer: fields["payer"] as string,
    payee: fields["payee"] as string,
    balance: Number(balanceFields?.fields?.value ?? 0),
    ratePerEpoch: Number(fields["rate_per_epoch"]),
    startEpoch: Number(fields["start_epoch"]),
    lastClaimedEpoch: Number(fields["last_claimed_epoch"]),
    open: fields["open"] as boolean,
  };
}
