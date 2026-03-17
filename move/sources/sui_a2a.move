module sui_agent_kit::sui_a2a {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use std::string::{Self, String};
    use sui_agent_kit::sui_agent_id::{Self, AgentCard};

    // ═══════════════════════════════════════
    // Error constants
    // ═══════════════════════════════════════
    const E_NOT_OWNER: u64 = 1;
    const E_EXPIRED: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;
    const E_INSUFFICIENT_FUNDS: u64 = 4;
    const E_INVALID_STATE: u64 = 5;
    const E_ALREADY_ACKED: u64 = 6;
    const E_NOT_RECIPIENT: u64 = 7;
    const E_NOT_SENDER: u64 = 8;
    const E_NOT_EXPIRED: u64 = 9;

    // Intent codes
    const INTENT_REQUEST: u8 = 0;
    const INTENT_FULFILL: u8 = 1;
    const INTENT_DELEGATE: u8 = 2;
    const INTENT_REJECT: u8 = 3;
    const INTENT_ACK: u8 = 4;

    // ═══════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════

    public struct AgentMessage has key {
        id: UID,
        sender_id: ID,
        recipient: address,
        intent: u8,
        payload_blob: String,
        payment_attached: Balance<SUI>,
        ttl_epoch: u64,
        requires_ack: bool,
        acked: bool,
    }

    // ═══════════════════════════════════════
    // Events
    // ═══════════════════════════════════════

    public struct MessageSent has copy, drop {
        message_id: ID,
        sender_id: ID,
        recipient: address,
        intent: u8,
        payment: u64,
    }

    public struct MessageAcknowledged has copy, drop {
        message_id: ID,
    }

    public struct MessageRejected has copy, drop {
        message_id: ID,
        reason_blob: String,
    }

    public struct MessageReclaimed has copy, drop {
        message_id: ID,
        amount: u64,
    }

    // ═══════════════════════════════════════
    // Entry functions
    // ═══════════════════════════════════════

    public entry fun send_message(
        sender: &AgentCard,
        recipient: address,
        intent: u8,
        payload_blob: vector<u8>,
        payment: Coin<SUI>,
        ttl_epoch: u64,
        requires_ack: bool,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(sui_agent_id::is_active(sender), E_INVALID_STATE);

        let payment_amount = coin::value(&payment);
        let msg = AgentMessage {
            id: object::new(ctx),
            sender_id: sui_agent_id::agent_id(sender),
            recipient,
            intent,
            payload_blob: string::utf8(payload_blob),
            payment_attached: coin::into_balance(payment),
            ttl_epoch,
            requires_ack,
            acked: false,
        };

        event::emit(MessageSent {
            message_id: object::id(&msg),
            sender_id: sui_agent_id::agent_id(sender),
            recipient,
            intent,
            payment: payment_amount,
        });

        transfer::transfer(msg, recipient);
    }

    public entry fun acknowledge(
        msg: &mut AgentMessage,
        _ack_payload_blob: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(msg.recipient == tx_context::sender(ctx), E_NOT_RECIPIENT);
        assert!(!msg.acked, E_ALREADY_ACKED);
        assert!(msg.requires_ack, E_INVALID_STATE);

        msg.acked = true;

        // Release attached payment to recipient
        let amount = balance::value(&msg.payment_attached);
        if (amount > 0) {
            let payment = coin::from_balance(
                balance::split(&mut msg.payment_attached, amount),
                ctx,
            );
            transfer::public_transfer(payment, msg.recipient);
        };

        event::emit(MessageAcknowledged { message_id: object::id(msg) });
    }

    public entry fun reject(
        msg: &mut AgentMessage,
        reason_blob: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(msg.recipient == tx_context::sender(ctx), E_NOT_RECIPIENT);
        assert!(!msg.acked, E_ALREADY_ACKED);

        // Return attached payment to sender (we can't resolve sender_id to address
        // directly, so payment stays in message for reclaim by sender)
        msg.acked = true; // mark as processed

        event::emit(MessageRejected {
            message_id: object::id(msg),
            reason_blob: string::utf8(reason_blob),
        });
    }

    public entry fun reclaim_expired(
        msg: &mut AgentMessage,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::epoch(ctx) > msg.ttl_epoch, E_NOT_EXPIRED);

        let amount = balance::value(&msg.payment_attached);
        if (amount > 0) {
            let payment = coin::from_balance(
                balance::split(&mut msg.payment_attached, amount),
                ctx,
            );
            // Return to the caller (should be the original sender)
            transfer::public_transfer(payment, tx_context::sender(ctx));
        };

        event::emit(MessageReclaimed {
            message_id: object::id(msg),
            amount,
        });
    }

    // ═══════════════════════════════════════
    // Public accessors
    // ═══════════════════════════════════════

    public fun message_sender_id(msg: &AgentMessage): ID {
        msg.sender_id
    }

    public fun message_recipient(msg: &AgentMessage): address {
        msg.recipient
    }

    public fun message_intent(msg: &AgentMessage): u8 {
        msg.intent
    }

    public fun message_acked(msg: &AgentMessage): bool {
        msg.acked
    }

    public fun message_payment_value(msg: &AgentMessage): u64 {
        balance::value(&msg.payment_attached)
    }

    // ═══════════════════════════════════════
    // Tests
    // ═══════════════════════════════════════

    #[test_only]
    public fun destroy_message_for_testing(msg: AgentMessage) {
        let AgentMessage {
            id, sender_id: _, recipient: _, intent: _, payload_blob: _,
            payment_attached, ttl_epoch: _, requires_ack: _, acked: _,
        } = msg;
        balance::destroy_for_testing(payment_attached);
        object::delete(id);
    }

    #[test_only]
    module tests {
        use sui::test_scenario;
        use sui::clock;
        use sui::coin;
        use sui::sui::SUI;
        use sui_agent_kit::sui_a2a::{Self, AgentMessage};
        use sui_agent_kit::sui_agent_id;

        #[test]
        fun test_send_message() {
            let sender_addr = @0xA;
            let recipient_addr = @0xB;
            let mut scenario = test_scenario::begin(sender_addr);

            // Register agent
            {
                let ctx = scenario.ctx();
                let mut registry = sui_agent_id::create_registry_for_testing(ctx);
                let clock = clock::create_for_testing(ctx);

                sui_agent_id::register_agent(
                    &mut registry,
                    b"SenderBot",
                    vector[b"trade"],
                    b"walrus://agent",
                    b"",
                    false,
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                sui_agent_id::destroy_registry_for_testing(registry);
            };

            scenario.next_tx(sender_addr);
            {
                let agent = scenario.take_from_sender<sui_agent_id::AgentCard>();
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();
                let payment = coin::mint_for_testing<SUI>(500_000_000, ctx);

                sui_a2a::send_message(
                    &agent,
                    recipient_addr,
                    0, // INTENT_REQUEST
                    b"walrus://payload123",
                    payment,
                    100,
                    true,
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                scenario.return_to_sender(agent);
            };

            // Verify recipient received the message
            scenario.next_tx(recipient_addr);
            {
                let msg = scenario.take_from_sender<AgentMessage>();
                assert!(sui_a2a::message_recipient(&msg) == recipient_addr);
                assert!(sui_a2a::message_intent(&msg) == 0);
                assert!(sui_a2a::message_payment_value(&msg) == 500_000_000);
                assert!(!sui_a2a::message_acked(&msg));
                scenario.return_to_sender(msg);
            };

            scenario.end();
        }

        #[test]
        fun test_acknowledge_message() {
            let sender_addr = @0xA;
            let recipient_addr = @0xB;
            let mut scenario = test_scenario::begin(sender_addr);

            {
                let ctx = scenario.ctx();
                let mut registry = sui_agent_id::create_registry_for_testing(ctx);
                let clock = clock::create_for_testing(ctx);

                sui_agent_id::register_agent(
                    &mut registry,
                    b"SenderBot",
                    vector[b"trade"],
                    b"walrus://agent",
                    b"",
                    false,
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                sui_agent_id::destroy_registry_for_testing(registry);
            };

            scenario.next_tx(sender_addr);
            {
                let agent = scenario.take_from_sender<sui_agent_id::AgentCard>();
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();
                let payment = coin::mint_for_testing<SUI>(100_000_000, ctx);

                sui_a2a::send_message(
                    &agent,
                    recipient_addr,
                    0,
                    b"walrus://req",
                    payment,
                    100,
                    true,
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                scenario.return_to_sender(agent);
            };

            scenario.next_tx(recipient_addr);
            {
                let mut msg = scenario.take_from_sender<AgentMessage>();
                let ctx = scenario.ctx();
                sui_a2a::acknowledge(&mut msg, b"walrus://ack_payload", ctx);
                assert!(sui_a2a::message_acked(&msg));
                assert!(sui_a2a::message_payment_value(&msg) == 0);
                scenario.return_to_sender(msg);
            };

            scenario.end();
        }

        #[test]
        fun test_reject_message() {
            let sender_addr = @0xA;
            let recipient_addr = @0xB;
            let mut scenario = test_scenario::begin(sender_addr);

            {
                let ctx = scenario.ctx();
                let mut registry = sui_agent_id::create_registry_for_testing(ctx);
                let clock = clock::create_for_testing(ctx);

                sui_agent_id::register_agent(
                    &mut registry,
                    b"SenderBot",
                    vector[b"trade"],
                    b"walrus://agent",
                    b"",
                    false,
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                sui_agent_id::destroy_registry_for_testing(registry);
            };

            scenario.next_tx(sender_addr);
            {
                let agent = scenario.take_from_sender<sui_agent_id::AgentCard>();
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();
                let payment = coin::mint_for_testing<SUI>(0, ctx);

                sui_a2a::send_message(
                    &agent,
                    recipient_addr,
                    0,
                    b"walrus://req",
                    payment,
                    100,
                    false,
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                scenario.return_to_sender(agent);
            };

            scenario.next_tx(recipient_addr);
            {
                let mut msg = scenario.take_from_sender<AgentMessage>();
                let ctx = scenario.ctx();
                sui_a2a::reject(&mut msg, b"not interested", ctx);
                assert!(sui_a2a::message_acked(&msg));
                scenario.return_to_sender(msg);
            };

            scenario.end();
        }
    }
}
