/// sui_stream — Epoch-based streaming payments.
/// Native Sui alternative to Sablier/Superfluid.
module sui_agent_kit::sui_stream {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;

    // ===== Error codes =====
    const E_NOT_PAYER: u64 = 0;
    const E_NOT_PAYEE: u64 = 1;
    const E_STREAM_CLOSED: u64 = 2;
    const E_NOTHING_TO_CLAIM: u64 = 3;
    const E_INSUFFICIENT_DEPOSIT: u64 = 4;

    // ===== Objects =====

    /// A payment stream from payer to payee.
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

    // ===== Events =====

    public struct StreamOpened has copy, drop {
        stream_id: address,
        payer: address,
        payee: address,
        rate_per_epoch: u64,
        deposit: u64,
    }

    public struct StreamClaimed has copy, drop {
        stream_id: address,
        payee: address,
        amount: u64,
        epochs_claimed: u64,
    }

    public struct StreamToppedUp has copy, drop {
        stream_id: address,
        amount: u64,
    }

    public struct StreamClosed has copy, drop {
        stream_id: address,
        refunded: u64,
    }

    // ===== Public functions =====

    /// Open a new payment stream.
    public entry fun open_stream(
        payee: address,
        rate_per_epoch: u64,
        deposit: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let deposit_value = coin::value(&deposit);
        assert!(deposit_value > 0, E_INSUFFICIENT_DEPOSIT);

        let payer = tx_context::sender(ctx);
        let current_epoch = tx_context::epoch(ctx);

        let stream = PaymentStream {
            id: object::new(ctx),
            payer,
            payee,
            balance: coin::into_balance(deposit),
            rate_per_epoch,
            start_epoch: current_epoch,
            last_claimed_epoch: current_epoch,
            open: true,
        };

        let stream_addr = object::uid_to_address(&stream.id);

        event::emit(StreamOpened {
            stream_id: stream_addr,
            payer,
            payee,
            rate_per_epoch,
            deposit: deposit_value,
        });

        transfer::share_object(stream);
    }

    /// Claim accrued payment (payee only).
    public entry fun claim(
        stream: &mut PaymentStream,
        ctx: &mut TxContext,
    ) {
        assert!(stream.payee == tx_context::sender(ctx), E_NOT_PAYEE);
        assert!(stream.open, E_STREAM_CLOSED);

        let current_epoch = tx_context::epoch(ctx);
        let epochs_owed = current_epoch - stream.last_claimed_epoch;
        assert!(epochs_owed > 0, E_NOTHING_TO_CLAIM);

        let owed_amount = epochs_owed * stream.rate_per_epoch;
        let available = balance::value(&stream.balance);
        let claim_amount = if (owed_amount > available) { available } else { owed_amount };

        assert!(claim_amount > 0, E_NOTHING_TO_CLAIM);

        let payment = coin::from_balance(
            balance::split(&mut stream.balance, claim_amount),
            ctx,
        );

        stream.last_claimed_epoch = current_epoch;

        event::emit(StreamClaimed {
            stream_id: object::uid_to_address(&stream.id),
            payee: stream.payee,
            amount: claim_amount,
            epochs_claimed: epochs_owed,
        });

        transfer::public_transfer(payment, stream.payee);
    }

    /// Top up the stream balance (payer only).
    public entry fun top_up(
        stream: &mut PaymentStream,
        deposit: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        assert!(stream.payer == tx_context::sender(ctx), E_NOT_PAYER);
        assert!(stream.open, E_STREAM_CLOSED);

        let amount = coin::value(&deposit);
        balance::join(&mut stream.balance, coin::into_balance(deposit));

        event::emit(StreamToppedUp {
            stream_id: object::uid_to_address(&stream.id),
            amount,
        });
    }

    /// Close the stream and refund remaining balance (payer only).
    public entry fun close_stream(
        stream: &mut PaymentStream,
        ctx: &mut TxContext,
    ) {
        assert!(stream.payer == tx_context::sender(ctx), E_NOT_PAYER);
        assert!(stream.open, E_STREAM_CLOSED);

        stream.open = false;
        let remaining = balance::value(&stream.balance);

        if (remaining > 0) {
            let refund = coin::from_balance(
                balance::split(&mut stream.balance, remaining),
                ctx,
            );
            transfer::public_transfer(refund, stream.payer);
        };

        event::emit(StreamClosed {
            stream_id: object::uid_to_address(&stream.id),
            refunded: remaining,
        });
    }

    // ===== View =====

    public fun stream_balance(s: &PaymentStream): u64 { balance::value(&s.balance) }
    public fun stream_is_open(s: &PaymentStream): bool { s.open }
    public fun stream_rate(s: &PaymentStream): u64 { s.rate_per_epoch }
    public fun stream_payee(s: &PaymentStream): address { s.payee }
    public fun stream_payer(s: &PaymentStream): address { s.payer }
    public fun stream_last_claimed(s: &PaymentStream): u64 { s.last_claimed_epoch }
}
