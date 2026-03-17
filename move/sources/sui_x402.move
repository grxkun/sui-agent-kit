/// Module 3 — x402 HTTP Payment Protocol
/// Native Sui implementation of the Coinbase/Cloudflare x402 payment standard.
/// Provides PaymentRequest + Receipt objects and automatic expiry.
module sui_agent_kit::sui_x402 {
    use std::string::String;
    use std::option::{Self, Option};
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};

    // ─── Error constants ───────────────────────────────────────────────────
    const E_NOT_OWNER: u64 = 1;
    const E_EXPIRED: u64 = 2;
    const E_INSUFFICIENT_FUNDS: u64 = 4;
    const E_INVALID_STATE: u64 = 5;

    // ─── Structs ───────────────────────────────────────────────────────────

    /// An open payment request for a URI-identified resource.
    public struct PaymentRequest has key, store {
        id: UID,
        resource_uri: String,
        amount: u64,
        token_type: String,          // "SUI" | "USDC"
        recipient: address,
        expiry: u64,                 // ms timestamp
        fulfilled: bool,
        payer: Option<address>,
        creator: address,
    }

    /// Immutable proof-of-payment issued after a successful fulfillment.
    public struct Receipt has key, store {
        id: UID,
        request_id: ID,
        payer: address,
        amount: u64,
        paid_at: u64,
    }

    // ─── Events ────────────────────────────────────────────────────────────

    public struct PaymentRequested has copy, drop {
        request_id: ID,
        resource_uri: String,
        amount: u64,
        recipient: address,
    }

    public struct PaymentFulfilled has copy, drop {
        receipt_id: ID,
        request_id: ID,
        payer: address,
    }

    // ─── Entry functions ───────────────────────────────────────────────────

    /// Create a PaymentRequest for a resource URI with a time-to-live in ms.
    public entry fun create_request(
        resource_uri: String,
        amount: u64,
        token_type: String,
        recipient: address,
        ttl: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let creator = tx_context::sender(ctx);
        let expiry = clock::timestamp_ms(clock) + ttl;

        let req = PaymentRequest {
            id: object::new(ctx),
            resource_uri,
            amount,
            token_type,
            recipient,
            expiry,
            fulfilled: false,
            payer: option::none(),
            creator,
        };

        event::emit(PaymentRequested {
            request_id: object::id(&req),
            resource_uri: req.resource_uri,
            amount,
            recipient,
        });

        // PaymentRequests are shared so any payer can fulfill them
        transfer::share_object(req);
    }

    /// Fulfill a shared PaymentRequest with the exact coin amount.
    /// The coin is transferred to the recipient and a Receipt returned to payer.
    public entry fun fulfill_request(
        request: &mut PaymentRequest,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let payer = tx_context::sender(ctx);

        assert!(!request.fulfilled, E_INVALID_STATE);
        assert!(clock::timestamp_ms(clock) <= request.expiry, E_EXPIRED);
        assert!(coin::value(&payment) >= request.amount, E_INSUFFICIENT_FUNDS);

        request.fulfilled = true;
        request.payer = option::some(payer);

        let request_id = object::id(request);
        let paid_at = clock::timestamp_ms(clock);

        // Send payment to recipient
        transfer::public_transfer(payment, request.recipient);

        let receipt = Receipt {
            id: object::new(ctx),
            request_id,
            payer,
            amount: request.amount,
            paid_at,
        };

        event::emit(PaymentFulfilled {
            receipt_id: object::id(&receipt),
            request_id,
            payer,
        });

        transfer::transfer(receipt, payer);
    }

    /// Returns true if the receipt's request_id matches the given request.
    public fun verify_receipt(receipt: &Receipt, request_id: ID): bool {
        receipt.request_id == request_id
    }

    /// Expire an unfulfilled request after its TTL has elapsed.
    public entry fun expire_request(
        request: &mut PaymentRequest,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(request.creator == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(!request.fulfilled, E_INVALID_STATE);
        assert!(clock::timestamp_ms(clock) > request.expiry, E_EXPIRED);
        // Mark as fulfilled to prevent any future payments
        request.fulfilled = true;
    }

    // ─── Pure accessors ────────────────────────────────────────────────────

    public fun receipt_request_id(receipt: &Receipt): ID { receipt.request_id }
    public fun receipt_payer(receipt: &Receipt): address { receipt.payer }
    public fun receipt_amount(receipt: &Receipt): u64 { receipt.amount }

    // ─── Tests ─────────────────────────────────────────────────────────────

    #[test_only]
    use sui::test_scenario;

    #[test]
    fun test_create_request() {
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        {
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            create_request(
                std::string::utf8(b"https://example.com/resource"),
                1_000_000_000,
                std::string::utf8(b"SUI"),
                @0xB,
                3_600_000, // 1 hour TTL
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let req = test_scenario::take_shared<PaymentRequest>(&scenario);
            assert!(!req.fulfilled, 0);
            assert!(req.amount == 1_000_000_000, 1);
            test_scenario::return_shared(req);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_fulfill_request() {
        let creator = @0xA;
        let payer = @0xB;
        let mut scenario = test_scenario::begin(creator);
        {
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            create_request(
                std::string::utf8(b"https://example.com/data"),
                500_000_000,
                std::string::utf8(b"SUI"),
                creator,
                3_600_000,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
        };
        test_scenario::next_tx(&mut scenario, payer);
        {
            let mut req = test_scenario::take_shared<PaymentRequest>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let payment = coin::mint_for_testing<SUI>(500_000_000, test_scenario::ctx(&mut scenario));
            fulfill_request(&mut req, payment, &clock, test_scenario::ctx(&mut scenario));
            assert!(req.fulfilled, 0);
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_shared(req);
        };
        test_scenario::next_tx(&mut scenario, payer);
        {
            let receipt = test_scenario::take_from_sender<Receipt>(&scenario);
            assert!(receipt.amount == 500_000_000, 0);
            test_scenario::return_to_sender(&scenario, receipt);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_verify_receipt() {
        let creator = @0xA;
        let payer = @0xB;
        let mut scenario = test_scenario::begin(creator);
        {
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            create_request(
                std::string::utf8(b"https://example.com/verify"),
                100_000_000,
                std::string::utf8(b"SUI"),
                creator,
                3_600_000,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
        };
        test_scenario::next_tx(&mut scenario, payer);
        {
            let mut req = test_scenario::take_shared<PaymentRequest>(&scenario);
            let req_id = object::id(&req);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let payment = coin::mint_for_testing<SUI>(100_000_000, test_scenario::ctx(&mut scenario));
            fulfill_request(&mut req, payment, &clock, test_scenario::ctx(&mut scenario));
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_shared(req);

            let receipt = test_scenario::take_from_sender<Receipt>(&scenario);
            assert!(verify_receipt(&receipt, req_id), 0);
            test_scenario::return_to_sender(&scenario, receipt);
        };
        test_scenario::end(scenario);
    }
}
