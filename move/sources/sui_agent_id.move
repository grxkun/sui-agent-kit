module sui_agent_kit::sui_agent_id {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::vec_set::{Self, VecSet};
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
    const E_CAPABILITY_MISSING: u64 = 6;

    // ═══════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════

    public struct AgentCard has key, store {
        id: UID,
        owner: address,
        name: String,
        version: u64,
        capabilities: VecSet<String>,
        endpoint_blob: String,
        mcp_endpoint: Option<String>,
        x402_support: bool,
        active: bool,
        created_at: u64,
    }

    public struct AgentRegistry has key {
        id: UID,
        total_agents: u64,
    }

    // ═══════════════════════════════════════
    // Events
    // ═══════════════════════════════════════

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

    // ═══════════════════════════════════════
    // Init — create shared registry
    // ═══════════════════════════════════════

    fun init(ctx: &mut TxContext) {
        let registry = AgentRegistry {
            id: object::new(ctx),
            total_agents: 0,
        };
        transfer::share_object(registry);
    }

    // ═══════════════════════════════════════
    // Entry functions
    // ═══════════════════════════════════════

    public entry fun register_agent(
        registry: &mut AgentRegistry,
        name: vector<u8>,
        capabilities: vector<vector<u8>>,
        endpoint_blob: vector<u8>,
        mcp_endpoint: vector<u8>,
        x402_support: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let mut caps = vec_set::empty<String>();
        let mut i = 0;
        while (i < capabilities.length()) {
            caps.insert(string::utf8(capabilities[i]));
            i = i + 1;
        };

        let mcp = if (mcp_endpoint.length() > 0) {
            option::some(string::utf8(mcp_endpoint))
        } else {
            option::none()
        };

        let agent = AgentCard {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            name: string::utf8(name),
            version: 1,
            capabilities: caps,
            endpoint_blob: string::utf8(endpoint_blob),
            mcp_endpoint: mcp,
            x402_support,
            active: true,
            created_at: clock::timestamp_ms(clock),
        };

        registry.total_agents = registry.total_agents + 1;

        event::emit(AgentRegistered {
            agent_id: object::id(&agent),
            owner: tx_context::sender(ctx),
            name: agent.name,
        });

        transfer::transfer(agent, tx_context::sender(ctx));
    }

    public entry fun update_capabilities(
        agent: &mut AgentCard,
        new_capabilities: vector<vector<u8>>,
        ctx: &mut TxContext,
    ) {
        assert!(agent.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(agent.active, E_INVALID_STATE);

        let mut caps = vec_set::empty<String>();
        let mut i = 0;
        while (i < new_capabilities.length()) {
            caps.insert(string::utf8(new_capabilities[i]));
            i = i + 1;
        };
        agent.capabilities = caps;
        agent.version = agent.version + 1;

        event::emit(AgentUpdated { agent_id: object::id(agent) });
    }

    public entry fun update_endpoint(
        agent: &mut AgentCard,
        endpoint_blob: vector<u8>,
        mcp_endpoint: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(agent.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(agent.active, E_INVALID_STATE);

        agent.endpoint_blob = string::utf8(endpoint_blob);
        agent.mcp_endpoint = if (mcp_endpoint.length() > 0) {
            option::some(string::utf8(mcp_endpoint))
        } else {
            option::none()
        };
        agent.version = agent.version + 1;

        event::emit(AgentUpdated { agent_id: object::id(agent) });
    }

    public entry fun deactivate(
        agent: &mut AgentCard,
        ctx: &mut TxContext,
    ) {
        assert!(agent.owner == tx_context::sender(ctx), E_NOT_OWNER);
        agent.active = false;

        event::emit(AgentDeactivated { agent_id: object::id(agent) });
    }

    // ═══════════════════════════════════════
    // Public accessors
    // ═══════════════════════════════════════

    public fun has_capability(agent: &AgentCard, cap: &String): bool {
        agent.capabilities.contains(cap)
    }

    public fun agent_id(agent: &AgentCard): ID {
        object::id(agent)
    }

    public fun agent_owner(agent: &AgentCard): address {
        agent.owner
    }

    public fun is_active(agent: &AgentCard): bool {
        agent.active
    }

    public fun agent_name(agent: &AgentCard): String {
        agent.name
    }

    public fun agent_capabilities(agent: &AgentCard): &VecSet<String> {
        &agent.capabilities
    }

    public fun agent_score_eligible(agent: &AgentCard): bool {
        agent.active
    }

    public fun agent_endpoint(agent: &AgentCard): String {
        agent.endpoint_blob
    }

    // ═══════════════════════════════════════
    // Tests
    // ═══════════════════════════════════════

    #[test_only]
    public fun create_registry_for_testing(ctx: &mut TxContext): AgentRegistry {
        AgentRegistry {
            id: object::new(ctx),
            total_agents: 0,
        }
    }

    #[test_only]
    public fun destroy_registry_for_testing(registry: AgentRegistry) {
        let AgentRegistry { id, total_agents: _ } = registry;
        object::delete(id);
    }

    #[test_only]
    public fun destroy_agent_for_testing(agent: AgentCard) {
        let AgentCard {
            id, owner: _, name: _, version: _, capabilities: _,
            endpoint_blob: _, mcp_endpoint: _, x402_support: _,
            active: _, created_at: _,
        } = agent;
        object::delete(id);
    }

    #[test_only]
    module tests {
        use sui::test_scenario;
        use sui::clock;
        use sui_agent_kit::sui_agent_id;

        #[test]
        fun test_register_agent() {
            let owner = @0xA;
            let mut scenario = test_scenario::begin(owner);
            let ctx = scenario.ctx();
            let mut registry = sui_agent_id::create_registry_for_testing(ctx);
            let clock = clock::create_for_testing(ctx);

            scenario.next_tx(owner);
            {
                let ctx = scenario.ctx();
                sui_agent_id::register_agent(
                    &mut registry,
                    b"TestAgent",
                    vector[b"trade", b"data"],
                    b"walrus://blob123",
                    b"https://mcp.example.com",
                    true,
                    &clock,
                    ctx,
                );
                assert!(registry.total_agents == 1);
            };

            scenario.next_tx(owner);
            {
                let agent = scenario.take_from_sender<sui_agent_id::AgentCard>();
                assert!(sui_agent_id::is_active(&agent));
                assert!(sui_agent_id::agent_owner(&agent) == owner);
                scenario.return_to_sender(agent);
            };

            clock::destroy_for_testing(clock);
            sui_agent_id::destroy_registry_for_testing(registry);
            scenario.end();
        }

        #[test]
        fun test_update_capabilities() {
            let owner = @0xA;
            let mut scenario = test_scenario::begin(owner);
            let ctx = scenario.ctx();
            let mut registry = sui_agent_id::create_registry_for_testing(ctx);
            let clock = clock::create_for_testing(ctx);

            scenario.next_tx(owner);
            {
                let ctx = scenario.ctx();
                sui_agent_id::register_agent(
                    &mut registry,
                    b"TestAgent",
                    vector[b"trade"],
                    b"walrus://blob123",
                    b"",
                    false,
                    &clock,
                    ctx,
                );
            };

            scenario.next_tx(owner);
            {
                let mut agent = scenario.take_from_sender<sui_agent_id::AgentCard>();
                let ctx = scenario.ctx();
                sui_agent_id::update_capabilities(
                    &mut agent,
                    vector[b"trade", b"data", b"delegate"],
                    ctx,
                );
                scenario.return_to_sender(agent);
            };

            clock::destroy_for_testing(clock);
            sui_agent_id::destroy_registry_for_testing(registry);
            scenario.end();
        }

        #[test]
        fun test_deactivate_agent() {
            let owner = @0xA;
            let mut scenario = test_scenario::begin(owner);
            let ctx = scenario.ctx();
            let mut registry = sui_agent_id::create_registry_for_testing(ctx);
            let clock = clock::create_for_testing(ctx);

            scenario.next_tx(owner);
            {
                let ctx = scenario.ctx();
                sui_agent_id::register_agent(
                    &mut registry,
                    b"TestAgent",
                    vector[b"trade"],
                    b"walrus://blob123",
                    b"",
                    false,
                    &clock,
                    ctx,
                );
            };

            scenario.next_tx(owner);
            {
                let mut agent = scenario.take_from_sender<sui_agent_id::AgentCard>();
                let ctx = scenario.ctx();
                sui_agent_id::deactivate(&mut agent, ctx);
                assert!(!sui_agent_id::is_active(&agent));
                scenario.return_to_sender(agent);
            };

            clock::destroy_for_testing(clock);
            sui_agent_id::destroy_registry_for_testing(registry);
            scenario.end();
        }
    }
}
