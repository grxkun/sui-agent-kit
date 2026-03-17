import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Keypair } from "@mysten/sui/cryptography";
import type {
  Receipt,
  CreatePaymentRequestParams,
  TransactionResult,
} from "./types";

const CLOCK_ID = "0x6";

export async function createPaymentRequest(
  params: CreatePaymentRequestParams & { packageId: string },
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  const tx = new Transaction();

  tx.moveCall({
    target: `${params.packageId}::sui_x402::create_request`,
    arguments: [
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(params.resourceUri))
      ),
      tx.pure.u64(params.amount),
      tx.pure.vector(
        "u8",
        Array.from(new TextEncoder().encode(params.tokenType))
      ),
      tx.pure.address(params.recipient),
      tx.pure.u64(params.ttl),
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

export async function fulfillRequest(
  requestId: string,
  packageId: string,
  client: SuiClient,
  signer: Keypair
): Promise<TransactionResult> {
  // First fetch the request to know the amount
  const reqObj = await client.getObject({
    id: requestId,
    options: { showContent: true },
  });
  if (!reqObj.data?.content || reqObj.data.content.dataType !== "moveObject") {
    throw new Error(`PaymentRequest ${requestId} not found`);
  }
  const fields = reqObj.data.content.fields as Record<string, unknown>;
  const amount = Number(fields["amount"]);

  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);

  tx.moveCall({
    target: `${packageId}::sui_x402::fulfill_request`,
    arguments: [tx.object(requestId), coin, tx.object(CLOCK_ID)],
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

/**
 * Express/HTTP middleware that intercepts 402 Payment Required responses
 * and auto-pays using the provided keypair.
 */
export function sui402Middleware(options: {
  client: SuiClient;
  signer: Keypair;
  packageId: string;
  maxAmount: number;
}) {
  return async (
    req: { headers: Record<string, string>; url?: string },
    res: {
      statusCode: number;
      setHeader: (k: string, v: string) => void;
      end: (body: string) => void;
    },
    next: (err?: Error) => void
  ) => {
    // Check for X-Payment-Request header (x402 protocol)
    const paymentRequestId = req.headers["x-payment-request"];
    if (!paymentRequestId) {
      return next();
    }

    try {
      // Fetch the payment request
      const reqObj = await options.client.getObject({
        id: paymentRequestId,
        options: { showContent: true },
      });

      if (
        !reqObj.data?.content ||
        reqObj.data.content.dataType !== "moveObject"
      ) {
        return next(new Error("Invalid payment request"));
      }

      const fields = reqObj.data.content.fields as Record<string, unknown>;
      const amount = Number(fields["amount"]);

      if (amount > options.maxAmount) {
        res.statusCode = 402;
        res.end(
          JSON.stringify({
            error: "Payment amount exceeds maximum allowed",
            amount,
            maxAmount: options.maxAmount,
          })
        );
        return;
      }

      const result = await fulfillRequest(
        paymentRequestId,
        options.packageId,
        options.client,
        options.signer
      );

      // Attach receipt info to request headers for downstream handlers
      req.headers["x-payment-receipt"] = result.digest;
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error(String(err)));
    }
  };
}
