module sui_agent_kit::sui_x402 {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use std::string::{Self, String};
    use std::option::{Self, Option};

    // ═══════════════════════════════════════
    // Error constants
    // ═══════════════════════════════════════
    const E_NOT_OWNER: u64 = 1;
    const E_EXPIRED: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;
    const E_INSUFFICIENT_FUNDS: u64 = 4;
    const E_INVALID_STATE: u64 = 5;
    const E_ALREADY_FULFILLED: u64 = 6;
    const E_NOT_EXPIRED: u64 = 7;
    const E_WRONG_AMOUNT: u64 = 8;

    // ═══════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════

    public struct PaymentRequest has key, store {
        id: UID,
        resource_uri: String,
        amount: u64,
        token_type: String,
        recipient: address,
        expiry: u64,
        fulfilled: bool,
        payer: Option<address>,
    }

    public struct Receipt has key, store {
        id: UID,
        request_id: ID,
        payer: address,
        amount: u64,
        paid_at: u64,
    }

    // ═══════════════════════════════════════
    // Events
    // ═══════════════════════════════════════

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

    public struct PaymentExpired has copy, drop {
        request_id: ID,
    }

    // ═══════════════════════════════════════
    // Entry functions
    // ═══════════════════════════════════════

    public entry fun create_request(
        resource_uri: vector<u8>,
        amount: u64,
        token_type: vector<u8>,
        recipient: address,
        ttl: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let expiry = clock::timestamp_ms(clock) + ttl;

        let request = PaymentRequest {
            id: object::new(ctx),
            resource_uri: string::utf8(resource_uri),
            amount,
            token_type: string::utf8(token_type),
            recipient,
            expiry,
            fulfilled: false,
            payer: option::none(),
        };

        event::emit(PaymentRequested {
            request_id: object::id(&request),
            resource_uri: request.resource_uri,
            amount,
            recipient,
        });

        transfer::share_object(request);
    }

    public entry fun fulfill_request(
        request: &mut PaymentRequest,
        mut payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!request.fulfilled, E_ALREADY_FULFILLED);
        assert!(clock::timestamp_ms(clock) <= request.expiry, E_EXPIRED);
        assert!(coin::value(&payment) >= request.amount, E_INSUFFICIENT_FUNDS);

        // Split exact amount if overpaid
        let paid = if (coin::value(&payment) > request.amount) {
            let exact = coin::split(&mut payment, request.amount, ctx);
            transfer::public_transfer(payment, tx_context::sender(ctx));
            exact
        } else {
            payment
        };

        // Transfer payment to recipient
        transfer::public_transfer(paid, request.recipient);

        request.fulfilled = true;
        request.payer = option::some(tx_context::sender(ctx));

        let receipt = Receipt {
            id: object::new(ctx),
            request_id: object::id(request),
            payer: tx_context::sender(ctx),
            amount: request.amount,
            paid_at: clock::timestamp_ms(clock),
        };

        event::emit(PaymentFulfilled {
            receipt_id: object::id(&receipt),
            request_id: object::id(request),
            payer: tx_context::sender(ctx),
        });

        transfer::transfer(receipt, tx_context::sender(ctx));
    }

    public fun verify_receipt(receipt: &Receipt, request_id: ID): bool {
        receipt.request_id == request_id
    }

    public entry fun expire_request(
        request: &mut PaymentRequest,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(!request.fulfilled, E_ALREADY_FULFILLED);
        assert!(clock::timestamp_ms(clock) > request.expiry, E_NOT_EXPIRED);

        event::emit(PaymentExpired { request_id: object::id(request) });
    }

    // ═══════════════════════════════════════
    // Public accessors
    // ═══════════════════════════════════════

    public fun request_amount(request: &PaymentRequest): u64 {
        request.amount
    }

    public fun request_fulfilled(request: &PaymentRequest): bool {
        request.fulfilled
    }

    public fun request_recipient(request: &PaymentRequest): address {
        request.recipient
    }

    public fun receipt_request_id(receipt: &Receipt): ID {
        receipt.request_id
    }

    public fun receipt_payer(receipt: &Receipt): address {
        receipt.payer
    }

    public fun receipt_amount(receipt: &Receipt): u64 {
        receipt.amount
    }

    // ═══════════════════════════════════════
    // Tests
    // ═══════════════════════════════════════

    #[test_only]
    public fun destroy_receipt_for_testing(receipt: Receipt) {
        let Receipt { id, request_id: _, payer: _, amount: _, paid_at: _ } = receipt;
        object::delete(id);
    }

    #[test_only]
    public fun destroy_request_for_testing(request: PaymentRequest) {
        let PaymentRequest {
            id, resource_uri: _, amount: _, token_type: _,
            recipient: _, expiry: _, fulfilled: _, payer: _,
        } = request;
        object::delete(id);
    }

    #[test_only]
    module tests {
        use sui::test_scenario;
        use sui::clock;
        use sui::coin;
        use sui::sui::SUI;
        use sui_agent_kit::sui_x402::{Self, PaymentRequest, Receipt};

        #[test]
        fun test_create_request() {
            let recipient = @0xA;
            let mut scenario = test_scenario::begin(recipient);

            {
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();
                sui_x402::create_request(
                    b"https://api.example.com/data",
                    1_000_000_000, // 1 SUI
                    b"SUI",
                    recipient,
                    60_000, // 60 seconds TTL
                    &clock,
                    ctx,
                );
                clock::destroy_for_testing(clock);
            };

            scenario.next_tx(recipient);
            {
                let request = scenario.take_shared<PaymentRequest>();
                assert!(sui_x402::request_amount(&request) == 1_000_000_000);
                assert!(!sui_x402::request_fulfilled(&request));
                assert!(sui_x402::request_recipient(&request) == recipient);
                test_scenario::return_shared(request);
            };

            scenario.end();
        }

        #[test]
        fun test_fulfill_request() {
            let recipient = @0xA;
            let payer = @0xB;
            let mut scenario = test_scenario::begin(recipient);

            {
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();
                sui_x402::create_request(
                    b"https://api.example.com/data",
                    1_000_000_000,
                    b"SUI",
                    recipient,
                    60_000,
                    &clock,
                    ctx,
                );
                clock::destroy_for_testing(clock);
            };

            scenario.next_tx(payer);
            {
                let mut request = scenario.take_shared<PaymentRequest>();
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();
                let payment = coin::mint_for_testing<SUI>(1_000_000_000, ctx);

                sui_x402::fulfill_request(&mut request, payment, &clock, ctx);
                assert!(sui_x402::request_fulfilled(&request));

                clock::destroy_for_testing(clock);
                test_scenario::return_shared(request);
            };

            scenario.next_tx(payer);
            {
                let receipt = scenario.take_from_sender<Receipt>();
                assert!(sui_x402::receipt_amount(&receipt) == 1_000_000_000);
                assert!(sui_x402::receipt_payer(&receipt) == payer);
                scenario.return_to_sender(receipt);
            };

            scenario.end();
        }

        #[test]
        #[expected_failure(abort_code = sui_x402::E_ALREADY_FULFILLED)]
        fun test_double_fulfill_fails() {
            let recipient = @0xA;
            let payer = @0xB;
            let mut scenario = test_scenario::begin(recipient);

            {
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();
                sui_x402::create_request(
                    b"https://api.example.com/data",
                    1_000_000_000,
                    b"SUI",
                    recipient,
                    60_000,
                    &clock,
                    ctx,
                );
                clock::destroy_for_testing(clock);
            };

            scenario.next_tx(payer);
            {
                let mut request = scenario.take_shared<PaymentRequest>();
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();
                let payment = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
                sui_x402::fulfill_request(&mut request, payment, &clock, ctx);

                // Attempt second fulfillment — should abort
                let payment2 = coin::mint_for_testing<SUI>(1_000_000_000, ctx);
                sui_x402::fulfill_request(&mut request, payment2, &clock, ctx);

                clock::destroy_for_testing(clock);
                test_scenario::return_shared(request);
            };

            scenario.end();
        }
    }
}
