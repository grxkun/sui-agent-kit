/// Module 7 — Agent-to-Agent (A2A) Messaging
/// Native Sui implementation of Google A2A communication semantics.
/// Messages are owned objects transferred to the recipient; payment can be
/// attached and reclaimed if the TTL expires without an ack.
module sui_agent_kit::sui_a2a {
    use std::string::String;
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use sui_agent_kit::sui_agent_id::AgentCard;

    // ─── Error constants ───────────────────────────────────────────────────
    const E_NOT_OWNER: u64 = 1;
    const E_EXPIRED: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;
    const E_INVALID_STATE: u64 = 5;

    // ─── Intent constants ──────────────────────────────────────────────────
    const INTENT_REQUEST: u8 = 0;
    const INTENT_FULFILL: u8 = 1;
    const INTENT_DELEGATE: u8 = 2;
    const INTENT_REJECT: u8 = 3;
    const INTENT_ACK: u8 = 4;

    // ─── Structs ───────────────────────────────────────────────────────────

    /// An A2A message owned by the recipient address.
    /// Carries an optional SUI payment inside the object.
    public struct AgentMessage has key {
        id: UID,
        sender_id: ID,
        sender_address: address,
        recipient: address,
        intent: u8,
        payload_blob: String,            // Walrus CID
        payment_attached: Balance<SUI>,  // can be zero
        ttl_epoch: u64,
        requires_ack: bool,
        acked: bool,
    }

    // ─── Events ────────────────────────────────────────────────────────────

    public struct MessageSent has copy, drop {
        msg_id: ID,
        sender_id: ID,
        recipient: address,
        intent: u8,
    }

    public struct MessageAcknowledged has copy, drop {
        msg_id: ID,
        ack_payload_blob: String,
    }

    public struct MessageRejected has copy, drop {
        msg_id: ID,
        reason_blob: String,
    }

    public struct PaymentReclaimed has copy, drop {
        msg_id: ID,
        amount: u64,
    }

    // ─── Entry functions ───────────────────────────────────────────────────

    /// Send an A2A message to `recipient` with an optional SUI payment.
    public entry fun send_message(
        sender: &AgentCard,
        recipient: address,
        intent: u8,
        payload_blob: String,
        payment: Coin<SUI>,
        ttl_epoch: u64,
        requires_ack: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(intent <= INTENT_ACK, E_INVALID_STATE);
        let sender_address = tx_context::sender(ctx);
        let sender_id = sui_agent_kit::sui_agent_id::agent_id(sender);

        let msg = AgentMessage {
            id: object::new(ctx),
            sender_id,
            sender_address,
            recipient,
            intent,
            payload_blob,
            payment_attached: coin::into_balance(payment),
            ttl_epoch,
            requires_ack,
            acked: false,
        };

        event::emit(MessageSent {
            msg_id: object::id(&msg),
            sender_id,
            recipient,
            intent,
        });

        let _ = clock::timestamp_ms(clock);
        transfer::transfer(msg, recipient);
    }

    /// Recipient acknowledges the message (required when requires_ack == true).
    public entry fun acknowledge(
        msg: &mut AgentMessage,
        ack_payload_blob: String,
        ctx: &mut TxContext,
    ) {
        assert!(msg.recipient == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(msg.requires_ack, E_INVALID_STATE);
        assert!(!msg.acked, E_INVALID_STATE);
        msg.acked = true;
        event::emit(MessageAcknowledged {
            msg_id: object::id(msg),
            ack_payload_blob,
        });
    }

    /// Recipient rejects the message, emitting a reason blob.
    public entry fun reject(
        msg: &mut AgentMessage,
        reason_blob: String,
        ctx: &mut TxContext,
    ) {
        assert!(msg.recipient == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(!msg.acked, E_INVALID_STATE);
        event::emit(MessageRejected {
            msg_id: object::id(msg),
            reason_blob,
        });
    }

    /// Sender reclaims the attached payment after the TTL has expired.
    public entry fun reclaim_expired(
        msg: &mut AgentMessage,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(msg.sender_address == tx_context::sender(ctx), E_UNAUTHORIZED);
        assert!(tx_context::epoch(ctx) > msg.ttl_epoch, E_EXPIRED);
        assert!(!msg.acked, E_INVALID_STATE);

        let amount = balance::value(&msg.payment_attached);
        if (amount > 0) {
            let refund = coin::from_balance(
                balance::split(&mut msg.payment_attached, amount),
                ctx,
            );
            event::emit(PaymentReclaimed { msg_id: object::id(msg), amount });
            transfer::public_transfer(refund, msg.sender_address);
        };

        let _ = clock::timestamp_ms(clock);
    }

    // ─── Pure accessors ────────────────────────────────────────────────────

    public fun msg_intent(msg: &AgentMessage): u8 { msg.intent }
    public fun msg_acked(msg: &AgentMessage): bool { msg.acked }
    public fun msg_payment(msg: &AgentMessage): u64 { balance::value(&msg.payment_attached) }

    // ─── Tests ─────────────────────────────────────────────────────────────

    #[test_only]
    use sui::test_scenario;

    #[test]
    fun test_send_and_ack_message() {
        use std::option;
        let sender_addr = @0xA;
        let recipient_addr = @0xB;
        let mut scenario = test_scenario::begin(sender_addr);

        // Register a sender agent
        {
            sui_agent_kit::sui_agent_id::register_agent_for_test(
                std::string::utf8(b"SenderAgent"),
                test_scenario::ctx(&mut scenario),
            );
        };
        test_scenario::next_tx(&mut scenario, sender_addr);
        {
            let sender_card = test_scenario::take_from_sender<sui_agent_kit::sui_agent_id::AgentCard>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let payment = coin::mint_for_testing<SUI>(0, test_scenario::ctx(&mut scenario));
            send_message(
                &sender_card,
                recipient_addr,
                INTENT_REQUEST,
                std::string::utf8(b"bafybeipayload"),
                payment,
                100,
                true,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_to_sender(&scenario, sender_card);
        };
        test_scenario::next_tx(&mut scenario, recipient_addr);
        {
            let mut msg = test_scenario::take_from_sender<AgentMessage>(&scenario);
            assert!(!msg.acked, 0);
            acknowledge(&mut msg, std::string::utf8(b"ack_blob"), test_scenario::ctx(&mut scenario));
            assert!(msg.acked, 1);
            test_scenario::return_to_sender(&scenario, msg);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_send_no_ack_required() {
        use std::option;
        let sender_addr = @0xA;
        let recipient_addr = @0xC;
        let mut scenario = test_scenario::begin(sender_addr);
        {
            sui_agent_kit::sui_agent_id::register_agent_for_test(
                std::string::utf8(b"AgentNoAck"),
                test_scenario::ctx(&mut scenario),
            );
        };
        test_scenario::next_tx(&mut scenario, sender_addr);
        {
            let sender_card = test_scenario::take_from_sender<sui_agent_kit::sui_agent_id::AgentCard>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let payment = coin::mint_for_testing<SUI>(0, test_scenario::ctx(&mut scenario));
            send_message(
                &sender_card,
                recipient_addr,
                INTENT_FULFILL,
                std::string::utf8(b"bafybeifulfill"),
                payment,
                50,
                false,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_to_sender(&scenario, sender_card);
        };
        test_scenario::next_tx(&mut scenario, recipient_addr);
        {
            let msg = test_scenario::take_from_sender<AgentMessage>(&scenario);
            assert!(!msg.requires_ack, 0);
            assert!(msg.intent == INTENT_FULFILL, 1);
            test_scenario::return_to_sender(&scenario, msg);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_reject_message() {
        use std::option;
        let sender_addr = @0xA;
        let recipient_addr = @0xD;
        let mut scenario = test_scenario::begin(sender_addr);
        {
            sui_agent_kit::sui_agent_id::register_agent_for_test(
                std::string::utf8(b"AgentReject"),
                test_scenario::ctx(&mut scenario),
            );
        };
        test_scenario::next_tx(&mut scenario, sender_addr);
        {
            let sender_card = test_scenario::take_from_sender<sui_agent_kit::sui_agent_id::AgentCard>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let payment = coin::mint_for_testing<SUI>(0, test_scenario::ctx(&mut scenario));
            send_message(
                &sender_card,
                recipient_addr,
                INTENT_REQUEST,
                std::string::utf8(b"bafybeireq"),
                payment,
                50,
                true,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_to_sender(&scenario, sender_card);
        };
        test_scenario::next_tx(&mut scenario, recipient_addr);
        {
            let mut msg = test_scenario::take_from_sender<AgentMessage>(&scenario);
            reject(&mut msg, std::string::utf8(b"reason_blob"), test_scenario::ctx(&mut scenario));
            // reject does not change acked, it just emits an event
            assert!(!msg.acked, 0);
            test_scenario::return_to_sender(&scenario, msg);
        };
        test_scenario::end(scenario);
    }
}
