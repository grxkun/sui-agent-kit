/// sui_x402 — HTTP 402 payment protocol for AI agents.
/// Agents create payment requests for API resources; payers fulfill atomically.
module sui_agent_kit::sui_x402 {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use std::string::{Self, String};

    // ===== Error codes =====
    const E_ALREADY_FULFILLED: u64 = 0;
    const E_EXPIRED: u64 = 1;
    const E_WRONG_AMOUNT: u64 = 2;
    const E_NOT_RECIPIENT: u64 = 3;
    const E_NOT_PAYER: u64 = 4;
    const E_RECEIPT_MISMATCH: u64 = 5;

    // ===== Objects =====

    /// A payment request for a resource.
    public struct PaymentRequest has key, store {
        id: UID,
        resource_uri: String,
        amount: u64,
        recipient: address,
        expiry: u64,
        fulfilled: bool,
        payer: address,
    }

    /// A receipt proving payment was made.
    public struct Receipt has key, store {
        id: UID,
        request_id: address,
        payer: address,
        amount: u64,
        paid_at: u64,
    }

    // ===== Events =====

    public struct PaymentRequestCreated has copy, drop {
        request_id: address,
        resource_uri: String,
        amount: u64,
        recipient: address,
        expiry: u64,
    }

    public struct PaymentFulfilled has copy, drop {
        request_id: address,
        receipt_id: address,
        payer: address,
        amount: u64,
        timestamp: u64,
    }

    // ===== Public functions =====

    /// Create a payment request.
    public entry fun create_request(
        resource_uri: vector<u8>,
        amount: u64,
        recipient: address,
        ttl_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        let expiry = now + ttl_ms;

        let request = PaymentRequest {
            id: object::new(ctx),
            resource_uri: string::utf8(resource_uri),
            amount,
            recipient,
            expiry,
            fulfilled: false,
            payer: @0x0,
        };

        let req_addr = object::uid_to_address(&request.id);

        event::emit(PaymentRequestCreated {
            request_id: req_addr,
            resource_uri: request.resource_uri,
            amount,
            recipient,
            expiry,
        });

        transfer::share_object(request);
    }

    /// Fulfill a payment request — pays the recipient, generates receipt.
    public entry fun fulfill(
        request: &mut PaymentRequest,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!request.fulfilled, E_ALREADY_FULFILLED);

        let now = clock::timestamp_ms(clock);
        assert!(now < request.expiry, E_EXPIRED);
        assert!(coin::value(&payment) >= request.amount, E_WRONG_AMOUNT);

        let payer = tx_context::sender(ctx);
        request.fulfilled = true;
        request.payer = payer;

        // Transfer payment to recipient
        transfer::public_transfer(payment, request.recipient);

        // Create receipt
        let receipt = Receipt {
            id: object::new(ctx),
            request_id: object::uid_to_address(&request.id),
            payer,
            amount: request.amount,
            paid_at: now,
        };

        let receipt_addr = object::uid_to_address(&receipt.id);

        event::emit(PaymentFulfilled {
            request_id: object::uid_to_address(&request.id),
            receipt_id: receipt_addr,
            payer,
            amount: request.amount,
            timestamp: now,
        });

        // Freeze receipt as immutable proof
        transfer::freeze_object(receipt);
    }

    /// Verify a receipt matches a request.
    public fun verify_receipt(
        receipt: &Receipt,
        request: &PaymentRequest,
    ): bool {
        receipt.request_id == object::uid_to_address(&request.id) &&
            receipt.amount >= request.amount
    }

    // ===== View =====

    public fun is_fulfilled(req: &PaymentRequest): bool { req.fulfilled }
    public fun request_amount(req: &PaymentRequest): u64 { req.amount }
    public fun request_recipient(req: &PaymentRequest): address { req.recipient }
    public fun receipt_payer(receipt: &Receipt): address { receipt.payer }
    public fun receipt_amount(receipt: &Receipt): u64 { receipt.amount }
}
