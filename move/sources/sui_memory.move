module sui_agent_kit::sui_memory {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::vec_set::{Self, VecSet};
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
    const E_HASH_MISMATCH: u64 = 6;
    const E_INVALID_MEMORY_TYPE: u64 = 7;

    // Memory types
    const MEMORY_EPISODIC: u8 = 0;
    const MEMORY_SEMANTIC: u8 = 1;
    const MEMORY_WORKING: u8 = 2;
    const MEMORY_PROCEDURAL: u8 = 3;

    // ═══════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════

    public struct MemoryAnchor has key, store {
        id: UID,
        agent_id: ID,
        memory_type: u8,
        blob_id: String,
        content_hash: vector<u8>,
        epoch: u64,
        public_readable: bool,
        tags: VecSet<String>,
    }

    public struct MemoryIndex has key {
        id: UID,
        agent_id: ID,
        anchor_count: u64,
    }

    // ═══════════════════════════════════════
    // Events
    // ═══════════════════════════════════════

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

    public struct MemoryIndexCreated has copy, drop {
        index_id: ID,
        agent_id: ID,
    }

    // ═══════════════════════════════════════
    // Entry functions
    // ═══════════════════════════════════════

    public entry fun create_memory_index(
        agent: &AgentCard,
        ctx: &mut TxContext,
    ) {
        assert!(sui_agent_id::is_active(agent), E_INVALID_STATE);

        let index = MemoryIndex {
            id: object::new(ctx),
            agent_id: sui_agent_id::agent_id(agent),
            anchor_count: 0,
        };

        event::emit(MemoryIndexCreated {
            index_id: object::id(&index),
            agent_id: sui_agent_id::agent_id(agent),
        });

        transfer::share_object(index);
    }

    public entry fun store_memory(
        agent: &AgentCard,
        index: &mut MemoryIndex,
        memory_type: u8,
        blob_id: vector<u8>,
        content_hash: vector<u8>,
        public_readable: bool,
        tags: vector<vector<u8>>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(sui_agent_id::is_active(agent), E_INVALID_STATE);
        assert!(
            sui_agent_id::agent_id(agent) == index.agent_id,
            E_UNAUTHORIZED,
        );
        assert!(memory_type <= MEMORY_PROCEDURAL, E_INVALID_MEMORY_TYPE);

        let mut tag_set = vec_set::empty<String>();
        let mut i = 0;
        while (i < tags.length()) {
            tag_set.insert(string::utf8(tags[i]));
            i = i + 1;
        };

        let anchor = MemoryAnchor {
            id: object::new(ctx),
            agent_id: sui_agent_id::agent_id(agent),
            memory_type,
            blob_id: string::utf8(blob_id),
            content_hash,
            epoch: clock::timestamp_ms(clock),
            public_readable,
            tags: tag_set,
        };

        index.anchor_count = index.anchor_count + 1;

        event::emit(MemoryStored {
            anchor_id: object::id(&anchor),
            agent_id: sui_agent_id::agent_id(agent),
            memory_type,
            blob_id: anchor.blob_id,
        });

        transfer::transfer(anchor, tx_context::sender(ctx));
    }

    public entry fun update_memory(
        anchor: &mut MemoryAnchor,
        new_blob_id: vector<u8>,
        new_content_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        anchor.blob_id = string::utf8(new_blob_id);
        anchor.content_hash = new_content_hash;
        anchor.epoch = clock::timestamp_ms(clock);

        event::emit(MemoryUpdated {
            anchor_id: object::id(anchor),
            new_blob_id: anchor.blob_id,
        });
    }

    public entry fun delete_memory(
        anchor: MemoryAnchor,
        index: &mut MemoryIndex,
        _ctx: &mut TxContext,
    ) {
        assert!(anchor.agent_id == index.agent_id, E_UNAUTHORIZED);

        let agent_id = anchor.agent_id;
        let anchor_id = object::id(&anchor);

        let MemoryAnchor {
            id, agent_id: _, memory_type: _, blob_id: _,
            content_hash: _, epoch: _, public_readable: _, tags: _,
        } = anchor;
        object::delete(id);

        index.anchor_count = index.anchor_count - 1;

        event::emit(MemoryDeleted { anchor_id, agent_id });
    }

    public fun verify_integrity(anchor: &MemoryAnchor, hash: vector<u8>): bool {
        anchor.content_hash == hash
    }

    // ═══════════════════════════════════════
    // Public accessors
    // ═══════════════════════════════════════

    public fun anchor_agent_id(anchor: &MemoryAnchor): ID {
        anchor.agent_id
    }

    public fun anchor_memory_type(anchor: &MemoryAnchor): u8 {
        anchor.memory_type
    }

    public fun anchor_blob_id(anchor: &MemoryAnchor): String {
        anchor.blob_id
    }

    public fun anchor_content_hash(anchor: &MemoryAnchor): vector<u8> {
        anchor.content_hash
    }

    public fun anchor_public_readable(anchor: &MemoryAnchor): bool {
        anchor.public_readable
    }

    public fun index_anchor_count(index: &MemoryIndex): u64 {
        index.anchor_count
    }

    // ═══════════════════════════════════════
    // Tests
    // ═══════════════════════════════════════

    #[test_only]
    public fun destroy_anchor_for_testing(anchor: MemoryAnchor) {
        let MemoryAnchor {
            id, agent_id: _, memory_type: _, blob_id: _,
            content_hash: _, epoch: _, public_readable: _, tags: _,
        } = anchor;
        object::delete(id);
    }

    #[test_only]
    public fun destroy_index_for_testing(index: MemoryIndex) {
        let MemoryIndex { id, agent_id: _, anchor_count: _ } = index;
        object::delete(id);
    }

    #[test_only]
    module tests {
        use sui::test_scenario;
        use sui::clock;
        use sui_agent_kit::sui_memory::{Self, MemoryAnchor, MemoryIndex};
        use sui_agent_kit::sui_agent_id;

        #[test]
        fun test_store_memory() {
            let owner = @0xA;
            let mut scenario = test_scenario::begin(owner);

            // Register agent
            {
                let ctx = scenario.ctx();
                let mut registry = sui_agent_id::create_registry_for_testing(ctx);
                let clock = clock::create_for_testing(ctx);

                sui_agent_id::register_agent(
                    &mut registry,
                    b"MemoryBot",
                    vector[b"memory"],
                    b"walrus://agent",
                    b"",
                    false,
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                sui_agent_id::destroy_registry_for_testing(registry);
            };

            // Create index
            scenario.next_tx(owner);
            {
                let agent = scenario.take_from_sender<sui_agent_id::AgentCard>();
                let ctx = scenario.ctx();
                sui_memory::create_memory_index(&agent, ctx);
                scenario.return_to_sender(agent);
            };

            // Store memory
            scenario.next_tx(owner);
            {
                let agent = scenario.take_from_sender<sui_agent_id::AgentCard>();
                let mut index = scenario.take_shared<MemoryIndex>();
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();

                sui_memory::store_memory(
                    &agent,
                    &mut index,
                    0, // episodic
                    b"walrus://memory_blob_1",
                    x"abcdef1234567890",
                    true,
                    vector[b"task", b"result"],
                    &clock,
                    ctx,
                );

                assert!(sui_memory::index_anchor_count(&index) == 1);

                clock::destroy_for_testing(clock);
                scenario.return_to_sender(agent);
                test_scenario::return_shared(index);
            };

            scenario.end();
        }

        #[test]
        fun test_update_memory() {
            let owner = @0xA;
            let mut scenario = test_scenario::begin(owner);

            {
                let ctx = scenario.ctx();
                let mut registry = sui_agent_id::create_registry_for_testing(ctx);
                let clock = clock::create_for_testing(ctx);

                sui_agent_id::register_agent(
                    &mut registry,
                    b"MemoryBot",
                    vector[b"memory"],
                    b"walrus://agent",
                    b"",
                    false,
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                sui_agent_id::destroy_registry_for_testing(registry);
            };

            scenario.next_tx(owner);
            {
                let agent = scenario.take_from_sender<sui_agent_id::AgentCard>();
                let ctx = scenario.ctx();
                sui_memory::create_memory_index(&agent, ctx);
                scenario.return_to_sender(agent);
            };

            scenario.next_tx(owner);
            {
                let agent = scenario.take_from_sender<sui_agent_id::AgentCard>();
                let mut index = scenario.take_shared<MemoryIndex>();
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();

                sui_memory::store_memory(
                    &agent,
                    &mut index,
                    1, // semantic
                    b"walrus://v1",
                    x"1111",
                    false,
                    vector[b"knowledge"],
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                scenario.return_to_sender(agent);
                test_scenario::return_shared(index);
            };

            scenario.next_tx(owner);
            {
                let mut anchor = scenario.take_from_sender<MemoryAnchor>();
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();

                sui_memory::update_memory(
                    &mut anchor,
                    b"walrus://v2",
                    x"2222",
                    &clock,
                    ctx,
                );

                assert!(sui_memory::anchor_blob_id(&anchor) == std::string::utf8(b"walrus://v2"));
                assert!(sui_memory::verify_integrity(&anchor, x"2222"));

                clock::destroy_for_testing(clock);
                scenario.return_to_sender(anchor);
            };

            scenario.end();
        }

        #[test]
        fun test_verify_integrity() {
            let owner = @0xA;
            let mut scenario = test_scenario::begin(owner);

            {
                let ctx = scenario.ctx();
                let mut registry = sui_agent_id::create_registry_for_testing(ctx);
                let clock = clock::create_for_testing(ctx);

                sui_agent_id::register_agent(
                    &mut registry,
                    b"MemoryBot",
                    vector[b"memory"],
                    b"walrus://agent",
                    b"",
                    false,
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                sui_agent_id::destroy_registry_for_testing(registry);
            };

            scenario.next_tx(owner);
            {
                let agent = scenario.take_from_sender<sui_agent_id::AgentCard>();
                let ctx = scenario.ctx();
                sui_memory::create_memory_index(&agent, ctx);
                scenario.return_to_sender(agent);
            };

            scenario.next_tx(owner);
            {
                let agent = scenario.take_from_sender<sui_agent_id::AgentCard>();
                let mut index = scenario.take_shared<MemoryIndex>();
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();

                sui_memory::store_memory(
                    &agent,
                    &mut index,
                    0,
                    b"walrus://mem",
                    x"deadbeef",
                    true,
                    vector[],
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                scenario.return_to_sender(agent);
                test_scenario::return_shared(index);
            };

            scenario.next_tx(owner);
            {
                let anchor = scenario.take_from_sender<MemoryAnchor>();
                assert!(sui_memory::verify_integrity(&anchor, x"deadbeef"));
                assert!(!sui_memory::verify_integrity(&anchor, x"00000000"));
                scenario.return_to_sender(anchor);
            };

            scenario.end();
        }
    }
}
