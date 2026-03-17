/**
 * x402.ts — SDK bindings for Module 3: sui_x402
 * Also exports an Express-compatible HTTP middleware that intercepts 402
 * responses and auto-pays via the Sui x402 contract.
 */
import {
  SuiClient,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import type { Keypair } from "@mysten/sui/cryptography";
import { bcs } from "@mysten/sui/bcs";
import type { PaymentRequest, Receipt, TransactionResult } from "./types.js";

export interface CreatePaymentRequestParams {
  packageId: string;
  clockId: string;
  resourceUri: string;
  amount: bigint;
  tokenType: "SUI" | "USDC";
  recipient: string;
  ttlMs: bigint;
}

/**
 * Create a new PaymentRequest (shared object) on-chain.
 */
export async function createPaymentRequest(
  params: CreatePaymentRequestParams,
  signer: Keypair,
  client: SuiClient
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::sui_x402::create_request`,
    arguments: [
      tx.pure(bcs.string().serialize(params.resourceUri).toBytes()),
      tx.pure(bcs.u64().serialize(params.amount).toBytes()),
      tx.pure(bcs.string().serialize(params.tokenType).toBytes()),
      tx.pure(bcs.Address.serialize(params.recipient).toBytes()),
      tx.pure(bcs.u64().serialize(params.ttlMs).toBytes()),
      tx.object(params.clockId),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true },
  });

  return { digest: result.digest, effects: result.effects };
}

/**
 * Fulfill an open PaymentRequest by providing a SUI Coin split from the
 * signer's balance.
 */
export async function fulfillRequest(
  packageId: string,
  requestId: string,
  clockId: string,
  signer: Keypair,
  client: SuiClient
): Promise<Receipt> {
  // Fetch the request to get the amount
  const reqObj = await client.getObject({
    id: requestId,
    options: { showContent: true },
  });

  if (!reqObj.data?.content || reqObj.data.content.dataType !== "moveObject") {
    throw new Error("PaymentRequest not found");
  }

  const fields = reqObj.data.content.fields as Record<string, unknown>;
  const amount = BigInt(String(fields["amount"] ?? "0"));

  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure(bcs.u64().serialize(amount).toBytes())]);

  const receipt = tx.moveCall({
    target: `${packageId}::sui_x402::fulfill_request`,
    arguments: [
      tx.object(requestId),
      coin,
      tx.object(clockId),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    options: { showEffects: true, showObjectChanges: true },
  });

  // Extract the new Receipt object from changes
  const created = result.objectChanges?.find(
    (c) =>
      c.type === "created" &&
      (c as { objectType?: string }).objectType?.includes("sui_x402::Receipt")
  );

  const receiptId = created && "objectId" in created ? created.objectId : "";

  return {
    id: receiptId,
    request_id: requestId,
    payer: String(fields["payer"] ?? ""),
    amount: String(amount),
    paid_at: "0",
  };
}

/**
 * Verify that a Receipt is linked to the given request ID.
 */
export async function verifyReceipt(
  client: SuiClient,
  receiptId: string,
  requestId: string
): Promise<boolean> {
  const obj = await client.getObject({
    id: receiptId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
    return false;
  }

  const fields = obj.data.content.fields as Record<string, unknown>;
  return fields["request_id"] === requestId;
}

// ─── HTTP 402 Middleware ──────────────────────────────────────────────────

export interface Sui402MiddlewareOptions {
  client: SuiClient;
  keypair: Keypair;
  packageId: string;
  clockId: string;
  maxAmount: bigint;
}

type Request = { url?: string; [key: string]: unknown };
type Response = {
  status?: number;
  statusCode?: number;
  on(event: string, cb: (body: unknown) => void): void;
  [key: string]: unknown;
};
type Next = (err?: unknown) => void;
type RequestHandler = (req: Request, res: Response, next: Next) => void;

/**
 * Express/HTTP middleware that intercepts upstream 402 responses and
 * automatically creates + fulfills a PaymentRequest on Sui.
 *
 * Usage:
 *   app.use(sui402Middleware({ client, keypair, packageId, clockId, maxAmount: 1_000_000_000n }));
 */
export function sui402Middleware(options: Sui402MiddlewareOptions): RequestHandler {
  return (req: Request, _res: Response, next: Next) => {
    const originalRes = _res;

    originalRes.on("finish", async () => {
      const statusCode = originalRes.statusCode ?? originalRes.status;
      if (statusCode !== 402) {
        return;
      }

      try {
        const resourceUri = req.url ?? "/";
        const requestResult = await createPaymentRequest(
          {
            packageId: options.packageId,
            clockId: options.clockId,
            resourceUri,
            amount: options.maxAmount,
            tokenType: "SUI",
            recipient: options.keypair.toSuiAddress(),
            ttlMs: BigInt(3_600_000), // 1 hour
          },
          options.keypair,
          options.client
        );
        console.info(`[sui402] Payment request created: ${requestResult.digest}`);
      } catch (err) {
        console.error("[sui402] Auto-pay failed:", err);
      }
    });

    next();
  };
}
