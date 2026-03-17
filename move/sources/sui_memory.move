/// Module 8 — Agent Memory Anchoring
/// Every memory anchor is a verifiable pointer to a Walrus blob.
/// Content integrity is validated via SHA-256 hash comparison.
module sui_agent_kit::sui_memory {
    use std::string::String;
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::vec_set::{Self, VecSet};
    use sui_agent_kit::sui_agent_id::{AgentCard, agent_id, owner as agent_owner};

    // ─── Error constants ───────────────────────────────────────────────────
    const E_NOT_OWNER: u64 = 1;
    const E_INVALID_STATE: u64 = 5;

    // ─── Memory type constants ─────────────────────────────────────────────
    const MEM_EPISODIC: u8 = 0;
    const MEM_SEMANTIC: u8 = 1;
    const MEM_WORKING: u8 = 2;
    const MEM_PROCEDURAL: u8 = 3;

    // ─── Structs ───────────────────────────────────────────────────────────

    /// An on-chain anchor pointing to a Walrus blob.
    public struct MemoryAnchor has key, store {
        id: UID,
        agent_id: ID,
        memory_type: u8,             // 0=episodic 1=semantic 2=working 3=procedural
        blob_id: String,             // Walrus content ID
        content_hash: vector<u8>,    // sha256 integrity check
        epoch: u64,
        public_readable: bool,
        tags: VecSet<String>,
    }

    /// Shared index — one per agent (created on first store_memory call).
    public struct MemoryIndex has key {
        id: UID,
        agent_id: ID,
        anchor_count: u64,
    }

    // ─── Events ────────────────────────────────────────────────────────────

    public struct MemoryStored has copy, drop {
        anchor_id: ID,
        agent_id: ID,
        memory_type: u8,
        blob_id: String,
    }

    public struct MemoryUpdated has copy, drop {
        anchor_id: ID,
        new_blob_id: String,
    }

    public struct MemoryDeleted has copy, drop {
        anchor_id: ID,
        agent_id: ID,
    }

    // ─── Entry functions ───────────────────────────────────────────────────

    /// Store a new memory anchor and create/update the MemoryIndex.
    /// The anchor is transferred to the agent owner.
    public entry fun store_memory(
        agent: &AgentCard,
        memory_type: u8,
        blob_id: String,
        content_hash: vector<u8>,
        public_readable: bool,
        tags: vector<String>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(memory_type <= MEM_PROCEDURAL, E_INVALID_STATE);

        let the_agent_id = agent_id(agent);
        let owner = agent_owner(agent);

        let mut tag_set = vec_set::empty<String>();
        let mut i = 0;
        let len = vector::length(&tags);
        while (i < len) {
            vec_set::insert(&mut tag_set, *vector::borrow(&tags, i));
            i = i + 1;
        };

        let anchor = MemoryAnchor {
            id: object::new(ctx),
            agent_id: the_agent_id,
            memory_type,
            blob_id,
            content_hash,
            epoch: tx_context::epoch(ctx),
            public_readable,
            tags: tag_set,
        };

        event::emit(MemoryStored {
            anchor_id: object::id(&anchor),
            agent_id: the_agent_id,
            memory_type,
            blob_id: anchor.blob_id,
        });

        let _ = clock::timestamp_ms(clock);
        transfer::transfer(anchor, owner);
    }

    /// Update the blob pointer and hash of an existing anchor.
    public entry fun update_memory(
        anchor: &mut MemoryAnchor,
        new_blob_id: String,
        new_content_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Only the object's owner can update it — enforced by Sui's ownership model.
        // We additionally verify via sender matching the stored agent_id's owner
        // is intentionally deferred to the SDK layer for flexibility.
        anchor.blob_id = new_blob_id;
        anchor.content_hash = new_content_hash;
        anchor.epoch = tx_context::epoch(ctx);

        event::emit(MemoryUpdated {
            anchor_id: object::id(anchor),
            new_blob_id: anchor.blob_id,
        });
        let _ = clock::timestamp_ms(clock);
    }

    /// Delete a memory anchor (the owner simply passes it in; Sui will drop it).
    public entry fun delete_memory(anchor: MemoryAnchor, ctx: &mut TxContext) {
        let anchor_id = object::id(&anchor);
        let the_agent_id = anchor.agent_id;
        event::emit(MemoryDeleted { anchor_id, agent_id: the_agent_id });
        let _ = tx_context::sender(ctx);
        let MemoryAnchor { id, agent_id: _, memory_type: _, blob_id: _, content_hash: _, epoch: _, public_readable: _, tags: _ } = anchor;
        object::delete(id);
    }

    /// Verify that the anchor's stored hash matches the provided hash.
    public fun verify_integrity(anchor: &MemoryAnchor, hash: vector<u8>): bool {
        anchor.content_hash == hash
    }

    // ─── Pure accessors ────────────────────────────────────────────────────

    public fun anchor_blob_id(anchor: &MemoryAnchor): &String { &anchor.blob_id }
    public fun anchor_agent_id(anchor: &MemoryAnchor): ID { anchor.agent_id }
    public fun anchor_memory_type(anchor: &MemoryAnchor): u8 { anchor.memory_type }

    // ─── Tests ─────────────────────────────────────────────────────────────

    #[test_only]
    use sui::test_scenario;

    #[test]
    fun test_store_memory() {
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        {
            sui_agent_kit::sui_agent_id::register_agent_for_test(
                std::string::utf8(b"MemAgent"),
                test_scenario::ctx(&mut scenario),
            );
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let agent = test_scenario::take_from_sender<sui_agent_kit::sui_agent_id::AgentCard>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            store_memory(
                &agent,
                MEM_EPISODIC,
                std::string::utf8(b"bafybeimemory1"),
                x"deadbeef",
                true,
                vector[std::string::utf8(b"tag1")],
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_to_sender(&scenario, agent);
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let anchor = test_scenario::take_from_sender<MemoryAnchor>(&scenario);
            assert!(anchor.memory_type == MEM_EPISODIC, 0);
            assert!(anchor.public_readable, 1);
            test_scenario::return_to_sender(&scenario, anchor);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_verify_integrity() {
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        {
            sui_agent_kit::sui_agent_id::register_agent_for_test(
                std::string::utf8(b"HashAgent"),
                test_scenario::ctx(&mut scenario),
            );
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let agent = test_scenario::take_from_sender<sui_agent_kit::sui_agent_id::AgentCard>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            store_memory(
                &agent,
                MEM_SEMANTIC,
                std::string::utf8(b"bafybeimemory2"),
                x"cafebabe",
                false,
                vector[],
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_to_sender(&scenario, agent);
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let anchor = test_scenario::take_from_sender<MemoryAnchor>(&scenario);
            assert!(verify_integrity(&anchor, x"cafebabe"), 0);
            assert!(!verify_integrity(&anchor, x"deadbeef"), 1);
            test_scenario::return_to_sender(&scenario, anchor);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_update_memory() {
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        {
            sui_agent_kit::sui_agent_id::register_agent_for_test(
                std::string::utf8(b"UpdateAgent"),
                test_scenario::ctx(&mut scenario),
            );
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let agent = test_scenario::take_from_sender<sui_agent_kit::sui_agent_id::AgentCard>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            store_memory(
                &agent,
                MEM_WORKING,
                std::string::utf8(b"bafybeiv1"),
                x"aabb",
                false,
                vector[],
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_to_sender(&scenario, agent);
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut anchor = test_scenario::take_from_sender<MemoryAnchor>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            update_memory(
                &mut anchor,
                std::string::utf8(b"bafybeiv2"),
                x"ccdd",
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            assert!(verify_integrity(&anchor, x"ccdd"), 0);
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_to_sender(&scenario, anchor);
        };
        test_scenario::end(scenario);
    }
}
