module sui_agent_kit::sui_stream {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;

    // ═══════════════════════════════════════
    // Error constants
    // ═══════════════════════════════════════
    const E_NOT_OWNER: u64 = 1;
    const E_EXPIRED: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;
    const E_INSUFFICIENT_FUNDS: u64 = 4;
    const E_INVALID_STATE: u64 = 5;
    const E_NOT_PAYER: u64 = 6;
    const E_NOT_PAYEE: u64 = 7;
    const E_STREAM_CLOSED: u64 = 8;

    // ═══════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════

    public struct PaymentStream has key, store {
        id: UID,
        payer: address,
        payee: address,
        balance: Balance<SUI>,
        rate_per_epoch: u64,
        start_epoch: u64,
        last_claimed_epoch: u64,
        open: bool,
    }

    // ═══════════════════════════════════════
    // Events
    // ═══════════════════════════════════════

    public struct StreamOpened has copy, drop {
        stream_id: ID,
        payer: address,
        payee: address,
        rate_per_epoch: u64,
        initial_deposit: u64,
    }

    public struct StreamToppedUp has copy, drop {
        stream_id: ID,
        amount: u64,
    }

    public struct StreamClaimed has copy, drop {
        stream_id: ID,
        amount: u64,
        epochs_claimed: u64,
    }

    public struct StreamClosed has copy, drop {
        stream_id: ID,
        refunded: u64,
    }

    // ═══════════════════════════════════════
    // Entry functions
    // ═══════════════════════════════════════

    public entry fun open_stream(
        payee: address,
        rate_per_epoch: u64,
        initial_deposit: Coin<SUI>,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let deposit_amount = coin::value(&initial_deposit);
        let current_epoch = tx_context::epoch(ctx);

        let stream = PaymentStream {
            id: object::new(ctx),
            payer: tx_context::sender(ctx),
            payee,
            balance: coin::into_balance(initial_deposit),
            rate_per_epoch,
            start_epoch: current_epoch,
            last_claimed_epoch: current_epoch,
            open: true,
        };

        event::emit(StreamOpened {
            stream_id: object::id(&stream),
            payer: tx_context::sender(ctx),
            payee,
            rate_per_epoch,
            initial_deposit: deposit_amount,
        });

        transfer::share_object(stream);
    }

    public entry fun top_up(
        stream: &mut PaymentStream,
        payment: Coin<SUI>,
    ) {
        assert!(stream.open, E_STREAM_CLOSED);
        let amount = coin::value(&payment);
        balance::join(&mut stream.balance, coin::into_balance(payment));

        event::emit(StreamToppedUp {
            stream_id: object::id(stream),
            amount,
        });
    }

    public entry fun claim(
        stream: &mut PaymentStream,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(stream.payee == tx_context::sender(ctx), E_NOT_PAYEE);
        assert!(stream.open, E_STREAM_CLOSED);

        let current_epoch = tx_context::epoch(ctx);
        let elapsed = current_epoch - stream.last_claimed_epoch;

        if (elapsed == 0) return;

        let owed = elapsed * stream.rate_per_epoch;
        let available = balance::value(&stream.balance);
        let claimable = if (owed > available) { available } else { owed };

        if (claimable > 0) {
            let payment = coin::from_balance(
                balance::split(&mut stream.balance, claimable),
                ctx,
            );
            transfer::public_transfer(payment, stream.payee);
            stream.last_claimed_epoch = current_epoch;

            event::emit(StreamClaimed {
                stream_id: object::id(stream),
                amount: claimable,
                epochs_claimed: elapsed,
            });
        };
    }

    public entry fun close(
        stream: &mut PaymentStream,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(stream.payer == tx_context::sender(ctx), E_NOT_PAYER);
        assert!(stream.open, E_STREAM_CLOSED);

        // Pay out any owed amount first
        let current_epoch = tx_context::epoch(ctx);
        let elapsed = current_epoch - stream.last_claimed_epoch;
        let owed = elapsed * stream.rate_per_epoch;
        let available = balance::value(&stream.balance);
        let payee_amount = if (owed > available) { available } else { owed };

        if (payee_amount > 0) {
            let payee_coin = coin::from_balance(
                balance::split(&mut stream.balance, payee_amount),
                ctx,
            );
            transfer::public_transfer(payee_coin, stream.payee);
        };

        // Refund remainder to payer
        let remaining = balance::value(&stream.balance);
        if (remaining > 0) {
            let refund = coin::from_balance(
                balance::split(&mut stream.balance, remaining),
                ctx,
            );
            transfer::public_transfer(refund, stream.payer);
        };

        stream.open = false;

        event::emit(StreamClosed {
            stream_id: object::id(stream),
            refunded: remaining,
        });
    }

    public entry fun drain_close(
        stream: &mut PaymentStream,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(stream.payee == tx_context::sender(ctx), E_NOT_PAYEE);
        assert!(stream.open, E_STREAM_CLOSED);

        let current_epoch = tx_context::epoch(ctx);
        let elapsed = current_epoch - stream.last_claimed_epoch;
        let owed = elapsed * stream.rate_per_epoch;
        let available = balance::value(&stream.balance);
        let claimable = if (owed > available) { available } else { owed };

        if (claimable > 0) {
            let payment = coin::from_balance(
                balance::split(&mut stream.balance, claimable),
                ctx,
            );
            transfer::public_transfer(payment, stream.payee);
        };

        // Return any excess to payer
        let remaining = balance::value(&stream.balance);
        if (remaining > 0) {
            let refund = coin::from_balance(
                balance::split(&mut stream.balance, remaining),
                ctx,
            );
            transfer::public_transfer(refund, stream.payer);
        };

        stream.open = false;

        event::emit(StreamClosed {
            stream_id: object::id(stream),
            refunded: remaining,
        });
    }

    // ═══════════════════════════════════════
    // Public accessors
    // ═══════════════════════════════════════

    public fun stream_balance(stream: &PaymentStream): u64 {
        balance::value(&stream.balance)
    }

    public fun stream_rate(stream: &PaymentStream): u64 {
        stream.rate_per_epoch
    }

    public fun stream_open(stream: &PaymentStream): bool {
        stream.open
    }

    public fun stream_payer(stream: &PaymentStream): address {
        stream.payer
    }

    public fun stream_payee(stream: &PaymentStream): address {
        stream.payee
    }

    // ═══════════════════════════════════════
    // Tests
    // ═══════════════════════════════════════

    #[test_only]
    public fun destroy_stream_for_testing(stream: PaymentStream) {
        let PaymentStream {
            id, payer: _, payee: _, balance, rate_per_epoch: _,
            start_epoch: _, last_claimed_epoch: _, open: _,
        } = stream;
        balance::destroy_for_testing(balance);
        object::delete(id);
    }

    #[test_only]
    module tests {
        use sui::test_scenario;
        use sui::clock;
        use sui::coin;
        use sui::sui::SUI;
        use sui_agent_kit::sui_stream::{Self, PaymentStream};

        #[test]
        fun test_open_stream() {
            let payer = @0xA;
            let payee = @0xB;
            let mut scenario = test_scenario::begin(payer);

            {
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();
                let deposit = coin::mint_for_testing<SUI>(10_000_000_000, ctx);

                sui_stream::open_stream(
                    payee,
                    1_000_000_000, // 1 SUI per epoch
                    deposit,
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
            };

            scenario.next_tx(payer);
            {
                let stream = scenario.take_shared<PaymentStream>();
                assert!(sui_stream::stream_balance(&stream) == 10_000_000_000);
                assert!(sui_stream::stream_open(&stream));
                assert!(sui_stream::stream_payer(&stream) == payer);
                assert!(sui_stream::stream_payee(&stream) == payee);
                test_scenario::return_shared(stream);
            };

            scenario.end();
        }

        #[test]
        fun test_top_up() {
            let payer = @0xA;
            let payee = @0xB;
            let mut scenario = test_scenario::begin(payer);

            {
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();
                let deposit = coin::mint_for_testing<SUI>(5_000_000_000, ctx);
                sui_stream::open_stream(payee, 1_000_000_000, deposit, &clock, ctx);
                clock::destroy_for_testing(clock);
            };

            scenario.next_tx(payer);
            {
                let mut stream = scenario.take_shared<PaymentStream>();
                let ctx = scenario.ctx();
                let extra = coin::mint_for_testing<SUI>(5_000_000_000, ctx);
                sui_stream::top_up(&mut stream, extra);
                assert!(sui_stream::stream_balance(&stream) == 10_000_000_000);
                test_scenario::return_shared(stream);
            };

            scenario.end();
        }

        #[test]
        fun test_close_stream() {
            let payer = @0xA;
            let payee = @0xB;
            let mut scenario = test_scenario::begin(payer);

            {
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();
                let deposit = coin::mint_for_testing<SUI>(10_000_000_000, ctx);
                sui_stream::open_stream(payee, 1_000_000_000, deposit, &clock, ctx);
                clock::destroy_for_testing(clock);
            };

            scenario.next_tx(payer);
            {
                let mut stream = scenario.take_shared<PaymentStream>();
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();
                sui_stream::close(&mut stream, &clock, ctx);
                assert!(!sui_stream::stream_open(&stream));
                clock::destroy_for_testing(clock);
                test_scenario::return_shared(stream);
            };

            scenario.end();
        }
    }
}
