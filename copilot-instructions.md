// ─────────────────────────────────────────────────────────────────────────────
// stream.ts — Payment stream SDK (wraps sui_stream.move)
// ─────────────────────────────────────────────────────────────────────────────

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import type { Keypair } from '@mysten/sui/cryptography';
import type { OpenStreamParams, PaymentStream } from './types.js';

export async function openStream(
  params: OpenStreamParams,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
) {
  const tx = new Transaction();
  const [deposit] = tx.splitCoins(tx.gas, [Number(params.initialDepositMist)]);

  tx.moveCall({
    target: `${packageId}::sui_stream::open_stream`,
    arguments: [
      tx.pure.address(params.payee),
      tx.pure.u64(params.ratePerEpoch),
      deposit,
    ],
  });

  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
}

export async function claimStream(
  streamId: string,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_stream::claim`,
    arguments: [tx.object(streamId)],
  });

  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true },
  });
}

export async function topUp(
  streamId: string,
  amount: bigint,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
) {
  const tx = new Transaction();
  const [deposit] = tx.splitCoins(tx.gas, [Number(amount)]);

  tx.moveCall({
    target: `${packageId}::sui_stream::top_up`,
    arguments: [tx.object(streamId), deposit],
  });

  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true },
  });
}

export async function closeStream(
  streamId: string,
  signer: Keypair,
  client: SuiClient,
  packageId: string,
) {
  const tx = new Transaction();

  tx.moveCall({
    target: `${packageId}::sui_stream::close_stream`,
    arguments: [tx.object(streamId)],
  });

  return client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true },
  });
}

export async function getStreamBalance(
  client: SuiClient,
  streamId: string,
): Promise<PaymentStream | null> {
  try {
    const obj = await client.getObject({
      id: streamId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      return null;
    }

    const f = obj.data.content.fields as Record<string, any>;
    return {
      id: streamId,
      payer: f.payer,
      payee: f.payee,
      balance: BigInt(f.balance?.value ?? 0),
      ratePerEpoch: BigInt(f.rate_per_epoch),
      startEpoch: BigInt(f.start_epoch),
      lastClaimedEpoch: BigInt(f.last_claimed_epoch),
      open: f.open,
    };
  } catch {
    return null;
  }
}
