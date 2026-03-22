/// sui_a2a — Agent-to-agent messaging protocol.
/// Google A2A equivalent: on-chain message objects with payment attachment.
module sui_agent_kit::sui_a2a {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use std::string::{Self, String};

    // ===== Error codes =====
    const E_NOT_SENDER: u64 = 0;
    const E_NOT_RECIPIENT: u64 = 1;
    const E_ALREADY_ACKED: u64 = 2;
    const E_EXPIRED: u64 = 3;
    const E_INVALID_INTENT: u64 = 4;

    // ===== Intent types =====
    const INTENT_REQUEST: u8 = 0;
    const INTENT_FULFILL: u8 = 1;
    const INTENT_DELEGATE: u8 = 2;
    const INTENT_REJECT: u8 = 3;
    const INTENT_ACK: u8 = 4;

    // ===== Objects =====

    /// An on-chain agent message with optional payment.
    public struct AgentMessage has key, store {
        id: UID,
        sender_id: address,
        recipient: address,
        intent: u8,
        payload_blob: String,
        payment_attached: Balance<SUI>,
        ttl_epoch: u64,
        requires_ack: bool,
        acked: bool,
        created_at: u64,
    }

    // ===== Events =====

    public struct MessageSent has copy, drop {
        message_id: address,
        sender_id: address,
        recipient: address,
        intent: u8,
        payment: u64,
        timestamp: u64,
    }

    public struct MessageAcknowledged has copy, drop {
        message_id: address,
        ack_payload: String,
        timestamp: u64,
    }

    // ===== Public functions =====

    /// Send a message to another agent, optionally attaching SUI payment.
    public entry fun send_message(
        sender_agent_card_id: address,
        recipient: address,
        intent: u8,
        payload_blob: vector<u8>,
        payment: Coin<SUI>,
        ttl_epoch: u64,
        requires_ack: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(intent <= 4, E_INVALID_INTENT);

        let now = clock::timestamp_ms(clock);
        let payment_value = coin::value(&payment);

        let msg = AgentMessage {
            id: object::new(ctx),
            sender_id: sender_agent_card_id,
            recipient,
            intent,
            payload_blob: string::utf8(payload_blob),
            payment_attached: coin::into_balance(payment),
            ttl_epoch,
            requires_ack,
            acked: false,
            created_at: now,
        };

        let msg_addr = object::uid_to_address(&msg.id);

        event::emit(MessageSent {
            message_id: msg_addr,
            sender_id: sender_agent_card_id,
            recipient,
            intent,
            payment: payment_value,
            timestamp: now,
        });

        transfer::transfer(msg, recipient);
    }

    /// Acknowledge a message and claim the attached payment.
    public entry fun acknowledge(
        msg: &mut AgentMessage,
        ack_payload_blob: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(msg.recipient == sender, E_NOT_RECIPIENT);
        assert!(!msg.acked, E_ALREADY_ACKED);

        let current_epoch = tx_context::epoch(ctx);
        assert!(current_epoch <= msg.ttl_epoch, E_EXPIRED);

        msg.acked = true;

        // Release payment to recipient
        let payment_amount = balance::value(&msg.payment_attached);
        if (payment_amount > 0) {
            let payment_coin = coin::from_balance(
                balance::split(&mut msg.payment_attached, payment_amount),
                ctx,
            );
            transfer::public_transfer(payment_coin, sender);
        };

        event::emit(MessageAcknowledged {
            message_id: object::uid_to_address(&msg.id),
            ack_payload: string::utf8(ack_payload_blob),
            timestamp: clock::timestamp_ms(clock),
        });
    }

    // ===== View =====

    public fun message_intent(msg: &AgentMessage): u8 { msg.intent }
    public fun message_sender(msg: &AgentMessage): address { msg.sender_id }
    public fun message_recipient(msg: &AgentMessage): address { msg.recipient }
    public fun message_payment(msg: &AgentMessage): u64 { balance::value(&msg.payment_attached) }
    public fun message_acked(msg: &AgentMessage): bool { msg.acked }
    public fun message_requires_ack(msg: &AgentMessage): bool { msg.requires_ack }
}
