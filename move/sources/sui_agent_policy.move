/// Module 2 — Delegation & Spending Policy
/// Mirrors Google AP2 authorization-cap semantics on Sui.
/// DelegationCap controls which modules an agent may call and how much SUI it
/// may spend per-transaction and per-day.
module sui_agent_kit::sui_agent_policy {
    use std::string::String;
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::vec_set::{Self, VecSet};

    // ─── Error constants ───────────────────────────────────────────────────
    const E_NOT_OWNER: u64 = 1;
    const E_EXPIRED: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;
    const E_INSUFFICIENT_FUNDS: u64 = 4;
    const E_INVALID_STATE: u64 = 5;

    // ─── Structs ───────────────────────────────────────────────────────────

    /// Owned capability granting an agent controlled spending rights.
    public struct DelegationCap has key, store {
        id: UID,
        agent_id: ID,
        delegator: address,
        allowed_modules: VecSet<String>,
        max_per_tx: u64,
        daily_limit: u64,
        expiry_epoch: u64,
        revocable: bool,
        active: bool,
    }

    /// Child object of DelegationCap — tracks daily spend per epoch.
    public struct SpendRecord has key, store {
        id: UID,
        cap_id: ID,
        epoch: u64,
        spent_today: u64,
    }

    // ─── Events ────────────────────────────────────────────────────────────

    public struct CapCreated has copy, drop {
        cap_id: ID,
        agent_id: ID,
        delegator: address,
    }

    public struct CapRevoked has copy, drop {
        cap_id: ID,
    }

    public struct SpendRecorded has copy, drop {
        cap_id: ID,
        amount: u64,
        remaining: u64,
    }

    // ─── Entry functions ───────────────────────────────────────────────────

    /// Create a DelegationCap and its associated SpendRecord, transferring
    /// both to the caller.
    public entry fun create_cap(
        agent_id: ID,
        allowed_modules: vector<String>,
        max_per_tx: u64,
        daily_limit: u64,
        expiry_epoch: u64,
        revocable: bool,
        ctx: &mut TxContext,
    ) {
        let delegator = tx_context::sender(ctx);
        let mut mod_set = vec_set::empty<String>();
        let mut i = 0;
        let len = vector::length(&allowed_modules);
        while (i < len) {
            vec_set::insert(&mut mod_set, *vector::borrow(&allowed_modules, i));
            i = i + 1;
        };

        let cap = DelegationCap {
            id: object::new(ctx),
            agent_id,
            delegator,
            allowed_modules: mod_set,
            max_per_tx,
            daily_limit,
            expiry_epoch,
            revocable,
            active: true,
        };
        let cap_id = object::id(&cap);

        let record = SpendRecord {
            id: object::new(ctx),
            cap_id,
            epoch: tx_context::epoch(ctx),
            spent_today: 0,
        };

        event::emit(CapCreated { cap_id, agent_id, delegator });

        transfer::transfer(record, delegator);
        transfer::transfer(cap, delegator);
    }

    /// Revoke a DelegationCap (only if revocable and caller is delegator).
    public entry fun revoke_cap(cap: &mut DelegationCap, ctx: &mut TxContext) {
        assert!(cap.delegator == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(cap.revocable, E_UNAUTHORIZED);
        assert!(cap.active, E_INVALID_STATE);
        cap.active = false;
        event::emit(CapRevoked { cap_id: object::id(cap) });
    }

    /// Authorize a spend and record it.  Returns true if allowed.
    /// Aborts with an error code on any policy violation.
    public fun authorize_spend(
        cap: &mut DelegationCap,
        record: &mut SpendRecord,
        module_name: String,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): bool {
        assert!(cap.active, E_INVALID_STATE);

        // Expiry check (epoch-based)
        let current_epoch = tx_context::epoch(ctx);
        assert!(current_epoch <= cap.expiry_epoch, E_EXPIRED);

        // Module whitelist check
        assert!(vec_set::contains(&cap.allowed_modules, &module_name), E_UNAUTHORIZED);

        // Per-tx limit
        assert!(amount <= cap.max_per_tx, E_INSUFFICIENT_FUNDS);

        // Reset daily spend if epoch has rolled over
        if (record.epoch < current_epoch) {
            record.spent_today = 0;
            record.epoch = current_epoch;
        };

        // Daily limit check
        let new_total = record.spent_today + amount;
        assert!(new_total <= cap.daily_limit, E_INSUFFICIENT_FUNDS);

        record.spent_today = new_total;
        let remaining = cap.daily_limit - new_total;

        event::emit(SpendRecorded {
            cap_id: object::id(cap),
            amount,
            remaining,
        });

        // Suppress unused variable warning from clock parameter
        let _ = clock::timestamp_ms(clock);
        true
    }

    /// Manually reset the daily spend counter (for a new epoch).
    public entry fun reset_daily_spend(
        record: &mut SpendRecord,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let current_epoch = tx_context::epoch(ctx);
        assert!(record.epoch < current_epoch, E_INVALID_STATE);
        record.spent_today = 0;
        record.epoch = current_epoch;
        let _ = clock::timestamp_ms(clock);
    }

    // ─── Pure accessors ────────────────────────────────────────────────────

    public fun cap_active(cap: &DelegationCap): bool { cap.active }
    public fun cap_id(cap: &DelegationCap): ID { object::id(cap) }

    // ─── Tests ─────────────────────────────────────────────────────────────

    #[test_only]
    use sui::test_scenario;

    #[test]
    fun test_create_and_revoke_cap() {
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        {
            let agent_id = object::id_from_address(@0x1);
            create_cap(
                agent_id,
                vector[std::string::utf8(b"sui_x402")],
                1_000_000_000,
                5_000_000_000,
                100,
                true,
                test_scenario::ctx(&mut scenario),
            );
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut cap = test_scenario::take_from_sender<DelegationCap>(&scenario);
            assert!(cap.active, 0);
            revoke_cap(&mut cap, test_scenario::ctx(&mut scenario));
            assert!(!cap.active, 1);
            test_scenario::return_to_sender(&scenario, cap);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_authorize_spend_success() {
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        {
            let agent_id = object::id_from_address(@0x1);
            create_cap(
                agent_id,
                vector[std::string::utf8(b"sui_x402")],
                500_000_000,
                2_000_000_000,
                999,
                true,
                test_scenario::ctx(&mut scenario),
            );
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut cap = test_scenario::take_from_sender<DelegationCap>(&scenario);
            let mut record = test_scenario::take_from_sender<SpendRecord>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let ok = authorize_spend(
                &mut cap,
                &mut record,
                std::string::utf8(b"sui_x402"),
                100_000_000,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            assert!(ok, 0);
            assert!(record.spent_today == 100_000_000, 1);
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_to_sender(&scenario, record);
        };
        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_UNAUTHORIZED)]
    fun test_authorize_spend_wrong_module() {
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        {
            let agent_id = object::id_from_address(@0x1);
            create_cap(
                agent_id,
                vector[std::string::utf8(b"sui_x402")],
                500_000_000,
                2_000_000_000,
                999,
                true,
                test_scenario::ctx(&mut scenario),
            );
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut cap = test_scenario::take_from_sender<DelegationCap>(&scenario);
            let mut record = test_scenario::take_from_sender<SpendRecord>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            authorize_spend(
                &mut cap,
                &mut record,
                std::string::utf8(b"sui_memory"), // not whitelisted
                100_000_000,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_to_sender(&scenario, cap);
            test_scenario::return_to_sender(&scenario, record);
        };
        test_scenario::end(scenario);
    }
}
