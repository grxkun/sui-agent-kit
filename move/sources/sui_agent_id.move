/// Module 1 — Agent Identity Registry
/// Every agent is a first-class owned AgentCard object.
/// A shared AgentRegistry tracks the total number of registered agents.
module sui_agent_kit::sui_agent_id {
    use std::string::String;
    use std::option::{Self, Option};
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::vec_set::{Self, VecSet};

    // ─── Error constants ───────────────────────────────────────────────────
    const E_NOT_OWNER: u64 = 1;
    const E_INVALID_STATE: u64 = 5;

    // ─── Structs ───────────────────────────────────────────────────────────

    /// Persistent, agent-owned identity card.
    public struct AgentCard has key, store {
        id: UID,
        owner: address,
        name: String,
        version: u64,
        capabilities: VecSet<String>,
        endpoint_blob: String,        // Walrus CID pointing to AgentCard JSON
        mcp_endpoint: Option<String>, // Ika/MCP endpoint URL
        x402_support: bool,           // signals HTTP payment rail compatibility
        active: bool,
        created_at: u64,
    }

    /// Shared global object — tracks the total number of registered agents.
    public struct AgentRegistry has key {
        id: UID,
        total_agents: u64,
    }

    // ─── Events ────────────────────────────────────────────────────────────

    public struct AgentRegistered has copy, drop {
        agent_id: ID,
        owner: address,
        name: String,
    }

    public struct AgentUpdated has copy, drop {
        agent_id: ID,
    }

    public struct AgentDeactivated has copy, drop {
        agent_id: ID,
    }

    // ─── Init ──────────────────────────────────────────────────────────────

    fun init(ctx: &mut TxContext) {
        let registry = AgentRegistry {
            id: object::new(ctx),
            total_agents: 0,
        };
        transfer::share_object(registry);
    }

    // ─── Entry functions ───────────────────────────────────────────────────

    /// Register a new AgentCard and transfer it to the caller.
    public entry fun register_agent(
        registry: &mut AgentRegistry,
        name: String,
        capabilities: vector<String>,
        endpoint_blob: String,
        mcp_endpoint: Option<String>,
        x402_support: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let owner = tx_context::sender(ctx);
        let mut cap_set = vec_set::empty<String>();
        let mut i = 0;
        let len = vector::length(&capabilities);
        while (i < len) {
            vec_set::insert(&mut cap_set, *vector::borrow(&capabilities, i));
            i = i + 1;
        };

        let card = AgentCard {
            id: object::new(ctx),
            owner,
            name,
            version: 1,
            capabilities: cap_set,
            endpoint_blob,
            mcp_endpoint,
            x402_support,
            active: true,
            created_at: clock::timestamp_ms(clock),
        };

        event::emit(AgentRegistered {
            agent_id: object::id(&card),
            owner,
            name: card.name,
        });

        registry.total_agents = registry.total_agents + 1;
        transfer::transfer(card, owner);
    }

    /// Replace the capability set on an owned AgentCard.
    public entry fun update_capabilities(
        agent: &mut AgentCard,
        new_capabilities: vector<String>,
        ctx: &mut TxContext,
    ) {
        assert!(agent.owner == tx_context::sender(ctx), E_NOT_OWNER);
        let mut cap_set = vec_set::empty<String>();
        let mut i = 0;
        let len = vector::length(&new_capabilities);
        while (i < len) {
            vec_set::insert(&mut cap_set, *vector::borrow(&new_capabilities, i));
            i = i + 1;
        };
        agent.capabilities = cap_set;
        agent.version = agent.version + 1;
        event::emit(AgentUpdated { agent_id: object::id(agent) });
    }

    /// Update the Walrus endpoint blob and optional MCP URL.
    public entry fun update_endpoint(
        agent: &mut AgentCard,
        endpoint_blob: String,
        mcp_endpoint: Option<String>,
        ctx: &mut TxContext,
    ) {
        assert!(agent.owner == tx_context::sender(ctx), E_NOT_OWNER);
        agent.endpoint_blob = endpoint_blob;
        agent.mcp_endpoint = mcp_endpoint;
        agent.version = agent.version + 1;
        event::emit(AgentUpdated { agent_id: object::id(agent) });
    }

    /// Deactivate the agent (irreversible via this function).
    public entry fun deactivate(agent: &mut AgentCard, ctx: &mut TxContext) {
        assert!(agent.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(agent.active, E_INVALID_STATE);
        agent.active = false;
        event::emit(AgentDeactivated { agent_id: object::id(agent) });
    }

    // ─── Pure helpers ──────────────────────────────────────────────────────

    /// Returns true if the agent has the given capability string.
    public fun has_capability(agent: &AgentCard, cap: &String): bool {
        vec_set::contains(&agent.capabilities, cap)
    }

    /// Expose the agent owner address.
    public fun owner(agent: &AgentCard): address { agent.owner }

    /// Expose active status.
    public fun is_active(agent: &AgentCard): bool { agent.active }

    /// Expose reputation score accessor (used by other modules).
    public fun agent_id(agent: &AgentCard): ID { object::id(agent) }

    // ─── Tests ─────────────────────────────────────────────────────────────

    #[test_only]
    use sui::test_scenario;

    /// Create a minimal AgentCard and transfer it to the caller — for use in
    /// other modules' test suites that need a valid AgentCard reference.
    #[test_only]
    public fun register_agent_for_test(name: String, ctx: &mut TxContext) {
        let owner = tx_context::sender(ctx);
        let card = AgentCard {
            id: object::new(ctx),
            owner,
            name,
            version: 1,
            capabilities: vec_set::empty<String>(),
            endpoint_blob: std::string::utf8(b"test"),
            mcp_endpoint: option::none(),
            x402_support: false,
            active: true,
            created_at: 0,
        };
        transfer::transfer(card, owner);
    }

    #[test]
    fun test_register_agent() {
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        {
            init(test_scenario::ctx(&mut scenario));
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut registry = test_scenario::take_shared<AgentRegistry>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            register_agent(
                &mut registry,
                std::string::utf8(b"TestAgent"),
                vector[std::string::utf8(b"trade")],
                std::string::utf8(b"bafybeiexample"),
                option::none(),
                true,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            assert!(registry.total_agents == 1, 0);
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let card = test_scenario::take_from_sender<AgentCard>(&scenario);
            assert!(card.active, 0);
            assert!(card.version == 1, 1);
            test_scenario::return_to_sender(&scenario, card);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_update_capabilities() {
        let owner = @0xB;
        let mut scenario = test_scenario::begin(owner);
        {
            init(test_scenario::ctx(&mut scenario));
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut registry = test_scenario::take_shared<AgentRegistry>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            register_agent(
                &mut registry,
                std::string::utf8(b"AgentB"),
                vector[std::string::utf8(b"data")],
                std::string::utf8(b"bafybeiexample2"),
                option::none(),
                false,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut card = test_scenario::take_from_sender<AgentCard>(&scenario);
            update_capabilities(
                &mut card,
                vector[std::string::utf8(b"data"), std::string::utf8(b"delegate")],
                test_scenario::ctx(&mut scenario),
            );
            assert!(card.version == 2, 0);
            let cap = std::string::utf8(b"delegate");
            assert!(has_capability(&card, &cap), 1);
            test_scenario::return_to_sender(&scenario, card);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_deactivate_agent() {
        let owner = @0xC;
        let mut scenario = test_scenario::begin(owner);
        {
            init(test_scenario::ctx(&mut scenario));
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut registry = test_scenario::take_shared<AgentRegistry>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            register_agent(
                &mut registry,
                std::string::utf8(b"AgentC"),
                vector[],
                std::string::utf8(b"bafybeiexample3"),
                option::none(),
                false,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_shared(registry);
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut card = test_scenario::take_from_sender<AgentCard>(&scenario);
            deactivate(&mut card, test_scenario::ctx(&mut scenario));
            assert!(!card.active, 0);
            test_scenario::return_to_sender(&scenario, card);
        };
        test_scenario::end(scenario);
    }
}
