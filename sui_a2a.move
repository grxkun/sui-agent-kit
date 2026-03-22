/// sui_agent_id — On-chain identity registry for AI agents.
/// ERC-8004 equivalent, native to Sui's object model.
module sui_agent_kit::sui_agent_id {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::vec_set::{Self, VecSet};
    use sui::table::{Self, Table};
    use std::string::{Self, String};
    use std::vector;

    // ===== Error codes =====
    const E_NOT_OWNER: u64 = 0;
    const E_ALREADY_REGISTERED: u64 = 1;
    const E_NOT_ACTIVE: u64 = 2;
    const E_INVALID_NAME: u64 = 3;
    const E_CAPABILITY_EXISTS: u64 = 4;

    // ===== Objects =====

    /// Global agent registry (shared object).
    public struct AgentRegistry has key {
        id: UID,
        total_agents: u64,
        /// owner_address → AgentCard object ID
        agents_by_owner: Table<address, address>,
    }

    /// An agent's on-chain identity card (owned object).
    public struct AgentCard has key, store {
        id: UID,
        owner: address,
        name: String,
        version: u64,
        capabilities: VecSet<String>,
        /// Walrus CID for the full AgentCard JSON
        endpoint_blob: String,
        /// Optional MCP/Ika endpoint URL
        mcp_endpoint: String,
        /// Whether this agent supports x402 payment protocol
        x402_support: bool,
        active: bool,
        created_at: u64,
    }

    // ===== Events =====

    public struct AgentRegistered has copy, drop {
        agent_id: address,
        owner: address,
        name: String,
        timestamp: u64,
    }

    public struct AgentDeactivated has copy, drop {
        agent_id: address,
        owner: address,
        timestamp: u64,
    }

    public struct CapabilityAdded has copy, drop {
        agent_id: address,
        capability: String,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        let registry = AgentRegistry {
            id: object::new(ctx),
            total_agents: 0,
            agents_by_owner: table::new(ctx),
        };
        transfer::share_object(registry);
    }

    // ===== Public functions =====

    /// Register a new agent identity on-chain.
    public entry fun register(
        registry: &mut AgentRegistry,
        name: vector<u8>,
        capabilities: vector<vector<u8>>,
        endpoint_blob: vector<u8>,
        mcp_endpoint: vector<u8>,
        x402_support: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        let name_str = string::utf8(name);
        assert!(string::length(&name_str) > 0, E_INVALID_NAME);

        let now = clock::timestamp_ms(clock);

        // Build capability set
        let mut cap_set = vec_set::empty<String>();
        let mut i = 0;
        let len = vector::length(&capabilities);
        while (i < len) {
            vec_set::insert(&mut cap_set, string::utf8(*vector::borrow(&capabilities, i)));
            i = i + 1;
        };

        let card = AgentCard {
            id: object::new(ctx),
            owner: sender,
            name: name_str,
            version: 1,
            capabilities: cap_set,
            endpoint_blob: string::utf8(endpoint_blob),
            mcp_endpoint: string::utf8(mcp_endpoint),
            x402_support,
            active: true,
            created_at: now,
        };

        let card_addr = object::uid_to_address(&card.id);

        // Track in registry
        if (!table::contains(&registry.agents_by_owner, sender)) {
            table::add(&mut registry.agents_by_owner, sender, card_addr);
        };
        registry.total_agents = registry.total_agents + 1;

        event::emit(AgentRegistered {
            agent_id: card_addr,
            owner: sender,
            name: card.name,
            timestamp: now,
        });

        transfer::transfer(card, sender);
    }

    /// Add a capability to an existing agent.
    public entry fun add_capability(
        card: &mut AgentCard,
        capability: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(card.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(card.active, E_NOT_ACTIVE);

        let cap_str = string::utf8(capability);
        vec_set::insert(&mut card.capabilities, cap_str);
        card.version = card.version + 1;

        event::emit(CapabilityAdded {
            agent_id: object::uid_to_address(&card.id),
            capability: cap_str,
        });
    }

    /// Remove a capability.
    public entry fun remove_capability(
        card: &mut AgentCard,
        capability: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(card.owner == tx_context::sender(ctx), E_NOT_OWNER);
        let cap_str = string::utf8(capability);
        vec_set::remove(&mut card.capabilities, &cap_str);
        card.version = card.version + 1;
    }

    /// Update the endpoint blob (Walrus CID).
    public entry fun update_endpoint(
        card: &mut AgentCard,
        endpoint_blob: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(card.owner == tx_context::sender(ctx), E_NOT_OWNER);
        card.endpoint_blob = string::utf8(endpoint_blob);
        card.version = card.version + 1;
    }

    /// Deactivate an agent.
    public entry fun deactivate(
        card: &mut AgentCard,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(card.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(card.active, E_NOT_ACTIVE);
        card.active = false;

        event::emit(AgentDeactivated {
            agent_id: object::uid_to_address(&card.id),
            owner: card.owner,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    // ===== View =====

    public fun name(card: &AgentCard): &String { &card.name }
    public fun owner(card: &AgentCard): address { card.owner }
    public fun is_active(card: &AgentCard): bool { card.active }
    public fun version(card: &AgentCard): u64 { card.version }
    public fun x402_support(card: &AgentCard): bool { card.x402_support }
    public fun has_capability(card: &AgentCard, cap: &String): bool {
        vec_set::contains(&card.capabilities, cap)
    }
    public fun total_agents(registry: &AgentRegistry): u64 { registry.total_agents }
}
