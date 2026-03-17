/// Module 6 — Continuous Payment Streams
/// Epoch-based streaming payments; payer locks funds upfront and payee
/// claims accrued balance at any time.
module sui_agent_kit::sui_stream {
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
    const E_UNAUTHORIZED: u64 = 3;
    const E_INSUFFICIENT_FUNDS: u64 = 4;
    const E_INVALID_STATE: u64 = 5;

    // ─── Structs ───────────────────────────────────────────────────────────

    /// A streaming payment channel between a payer and a payee.
    public struct PaymentStream has key, store {
        id: UID,
        payer: address,
        payee: address,
        balance: Balance<SUI>,
        rate_per_epoch: u64,     // MIST per epoch
        start_epoch: u64,
        last_claimed_epoch: u64,
        open: bool,
    }

    // ─── Events ────────────────────────────────────────────────────────────

    public struct StreamOpened has copy, drop {
        stream_id: ID,
        payer: address,
        payee: address,
        rate_per_epoch: u64,
    }

    public struct StreamClaimed has copy, drop {
        stream_id: ID,
        payee: address,
        amount: u64,
    }

    public struct StreamToppedUp has copy, drop {
        stream_id: ID,
        amount: u64,
    }

    public struct StreamClosed has copy, drop {
        stream_id: ID,
        remaining: u64,
    }

    // ─── Entry functions ───────────────────────────────────────────────────

    /// Open a new payment stream.  The initial deposit is locked into the stream.
    public entry fun open_stream(
        payee: address,
        rate_per_epoch: u64,
        initial_deposit: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let payer = tx_context::sender(ctx);
        assert!(rate_per_epoch > 0, E_INVALID_STATE);
        let current_epoch = tx_context::epoch(ctx);

        let stream = PaymentStream {
            id: object::new(ctx),
            payer,
            payee,
            balance: coin::into_balance(initial_deposit),
            rate_per_epoch,
            start_epoch: current_epoch,
            last_claimed_epoch: current_epoch,
            open: true,
        };

        event::emit(StreamOpened {
            stream_id: object::id(&stream),
            payer,
            payee,
            rate_per_epoch,
        });

        let _ = clock::timestamp_ms(clock);
        transfer::share_object(stream);
    }

    /// Top up the stream balance (callable by anyone, typically the payer).
    public entry fun top_up(stream: &mut PaymentStream, payment: Coin<SUI>) {
        assert!(stream.open, E_INVALID_STATE);
        let amount = coin::value(&payment);
        balance::join(&mut stream.balance, coin::into_balance(payment));
        event::emit(StreamToppedUp { stream_id: object::id(stream), amount });
    }

    /// Payee claims all accrued balance up to the current epoch.
    public entry fun claim(
        stream: &mut PaymentStream,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(stream.payee == tx_context::sender(ctx), E_UNAUTHORIZED);
        assert!(stream.open, E_INVALID_STATE);

        let current_epoch = tx_context::epoch(ctx);
        let epochs_elapsed = if (current_epoch > stream.last_claimed_epoch) {
            current_epoch - stream.last_claimed_epoch
        } else {
            0
        };

        let accrued = epochs_elapsed * stream.rate_per_epoch;
        let available = balance::value(&stream.balance);
        let claimable = if (accrued <= available) { accrued } else { available };

        if (claimable > 0) {
            let payout = coin::from_balance(
                balance::split(&mut stream.balance, claimable),
                ctx,
            );
            stream.last_claimed_epoch = current_epoch;
            event::emit(StreamClaimed {
                stream_id: object::id(stream),
                payee: stream.payee,
                amount: claimable,
            });
            transfer::public_transfer(payout, stream.payee);
        };

        let _ = clock::timestamp_ms(clock);
    }

    /// Payer closes the stream; remaining balance returned to payer.
    public entry fun close(
        stream: &mut PaymentStream,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(stream.payer == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(stream.open, E_INVALID_STATE);

        stream.open = false;
        let remaining = balance::value(&stream.balance);

        if (remaining > 0) {
            let refund = coin::from_balance(
                balance::split(&mut stream.balance, remaining),
                ctx,
            );
            transfer::public_transfer(refund, stream.payer);
        };

        event::emit(StreamClosed { stream_id: object::id(stream), remaining });
        let _ = clock::timestamp_ms(clock);
    }

    /// Payee drains accrued balance then closes the stream.
    public entry fun drain_close(
        stream: &mut PaymentStream,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(stream.payee == tx_context::sender(ctx), E_UNAUTHORIZED);
        assert!(stream.open, E_INVALID_STATE);

        let current_epoch = tx_context::epoch(ctx);
        let epochs_elapsed = if (current_epoch > stream.last_claimed_epoch) {
            current_epoch - stream.last_claimed_epoch
        } else {
            0
        };

        let accrued = epochs_elapsed * stream.rate_per_epoch;
        let available = balance::value(&stream.balance);
        let claimable = if (accrued <= available) { accrued } else { available };

        if (claimable > 0) {
            let payout = coin::from_balance(
                balance::split(&mut stream.balance, claimable),
                ctx,
            );
            stream.last_claimed_epoch = current_epoch;
            event::emit(StreamClaimed {
                stream_id: object::id(stream),
                payee: stream.payee,
                amount: claimable,
            });
            transfer::public_transfer(payout, stream.payee);
        };

        // Return any remaining balance to payer
        let remaining = balance::value(&stream.balance);
        if (remaining > 0) {
            let refund = coin::from_balance(
                balance::split(&mut stream.balance, remaining),
                ctx,
            );
            transfer::public_transfer(refund, stream.payer);
        };

        stream.open = false;
        event::emit(StreamClosed { stream_id: object::id(stream), remaining });
        let _ = clock::timestamp_ms(clock);
    }

    // ─── Pure accessors ────────────────────────────────────────────────────

    public fun stream_balance(stream: &PaymentStream): u64 { balance::value(&stream.balance) }
    public fun stream_open(stream: &PaymentStream): bool { stream.open }

    // ─── Tests ─────────────────────────────────────────────────────────────

    #[test_only]
    use sui::test_scenario;

    #[test]
    fun test_open_stream() {
        let payer = @0xA;
        let payee = @0xB;
        let mut scenario = test_scenario::begin(payer);
        {
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let deposit = coin::mint_for_testing<SUI>(10_000_000_000, test_scenario::ctx(&mut scenario));
            open_stream(payee, 100_000_000, deposit, &clock, test_scenario::ctx(&mut scenario));
            sui::clock::destroy_for_testing(clock);
        };
        test_scenario::next_tx(&mut scenario, payer);
        {
            let stream = test_scenario::take_shared<PaymentStream>(&scenario);
            assert!(stream.open, 0);
            assert!(stream_balance(&stream) == 10_000_000_000, 1);
            test_scenario::return_shared(stream);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_top_up_stream() {
        let payer = @0xA;
        let payee = @0xB;
        let mut scenario = test_scenario::begin(payer);
        {
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let deposit = coin::mint_for_testing<SUI>(1_000_000_000, test_scenario::ctx(&mut scenario));
            open_stream(payee, 100_000_000, deposit, &clock, test_scenario::ctx(&mut scenario));
            sui::clock::destroy_for_testing(clock);
        };
        test_scenario::next_tx(&mut scenario, payer);
        {
            let mut stream = test_scenario::take_shared<PaymentStream>(&scenario);
            let extra = coin::mint_for_testing<SUI>(500_000_000, test_scenario::ctx(&mut scenario));
            top_up(&mut stream, extra);
            assert!(stream_balance(&stream) == 1_500_000_000, 0);
            test_scenario::return_shared(stream);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_close_stream_refunds_payer() {
        let payer = @0xA;
        let payee = @0xB;
        let mut scenario = test_scenario::begin(payer);
        {
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let deposit = coin::mint_for_testing<SUI>(5_000_000_000, test_scenario::ctx(&mut scenario));
            open_stream(payee, 100_000_000, deposit, &clock, test_scenario::ctx(&mut scenario));
            sui::clock::destroy_for_testing(clock);
        };
        test_scenario::next_tx(&mut scenario, payer);
        {
            let mut stream = test_scenario::take_shared<PaymentStream>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            close(&mut stream, &clock, test_scenario::ctx(&mut scenario));
            assert!(!stream.open, 0);
            assert!(stream_balance(&stream) == 0, 1);
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_shared(stream);
        };
        test_scenario::end(scenario);
    }
}
