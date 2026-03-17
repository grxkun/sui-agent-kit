module sui_agent_kit::sui_agent_policy {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::vec_set::{Self, VecSet};
    use std::string::{Self, String};

    // ═══════════════════════════════════════
    // Error constants
    // ═══════════════════════════════════════
    const E_NOT_OWNER: u64 = 1;
    const E_EXPIRED: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;
    const E_INSUFFICIENT_FUNDS: u64 = 4;
    const E_INVALID_STATE: u64 = 5;
    const E_CAPABILITY_MISSING: u64 = 6;
    const E_DAILY_LIMIT_EXCEEDED: u64 = 7;
    const E_PER_TX_LIMIT_EXCEEDED: u64 = 8;
    const E_MODULE_NOT_ALLOWED: u64 = 9;

    // ═══════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════

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

    public struct SpendRecord has key, store {
        id: UID,
        cap_id: ID,
        epoch: u64,
        spent_today: u64,
    }

    // ═══════════════════════════════════════
    // Events
    // ═══════════════════════════════════════

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

    // ═══════════════════════════════════════
    // Entry functions
    // ═══════════════════════════════════════

    public entry fun create_cap(
        agent_id: ID,
        allowed_modules: vector<vector<u8>>,
        max_per_tx: u64,
        daily_limit: u64,
        expiry_epoch: u64,
        revocable: bool,
        ctx: &mut TxContext,
    ) {
        let mut modules = vec_set::empty<String>();
        let mut i = 0;
        while (i < allowed_modules.length()) {
            modules.insert(string::utf8(allowed_modules[i]));
            i = i + 1;
        };

        let cap = DelegationCap {
            id: object::new(ctx),
            agent_id,
            delegator: tx_context::sender(ctx),
            allowed_modules: modules,
            max_per_tx,
            daily_limit,
            expiry_epoch,
            revocable,
            active: true,
        };

        let cap_id = object::id(&cap);

        // Create the initial spend record
        let record = SpendRecord {
            id: object::new(ctx),
            cap_id,
            epoch: tx_context::epoch(ctx),
            spent_today: 0,
        };

        event::emit(CapCreated {
            cap_id,
            agent_id,
            delegator: tx_context::sender(ctx),
        });

        transfer::transfer(record, tx_context::sender(ctx));
        transfer::transfer(cap, tx_context::sender(ctx));
    }

    public entry fun revoke_cap(
        cap: &mut DelegationCap,
        ctx: &mut TxContext,
    ) {
        assert!(cap.delegator == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(cap.revocable, E_UNAUTHORIZED);
        cap.active = false;

        event::emit(CapRevoked { cap_id: object::id(cap) });
    }

    public entry fun authorize_spend(
        cap: &DelegationCap,
        record: &mut SpendRecord,
        module_name: vector<u8>,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(cap.active, E_INVALID_STATE);
        assert!(tx_context::epoch(ctx) <= cap.expiry_epoch, E_EXPIRED);
        assert!(record.cap_id == object::id(cap), E_UNAUTHORIZED);

        let mod_str = string::utf8(module_name);
        assert!(cap.allowed_modules.contains(&mod_str), E_MODULE_NOT_ALLOWED);
        assert!(amount <= cap.max_per_tx, E_PER_TX_LIMIT_EXCEEDED);

        // Reset daily spend if epoch rolled over
        let current_epoch = tx_context::epoch(ctx);
        if (record.epoch < current_epoch) {
            record.epoch = current_epoch;
            record.spent_today = 0;
        };

        assert!(record.spent_today + amount <= cap.daily_limit, E_DAILY_LIMIT_EXCEEDED);
        record.spent_today = record.spent_today + amount;

        let remaining = cap.daily_limit - record.spent_today;
        event::emit(SpendRecorded {
            cap_id: object::id(cap),
            amount,
            remaining,
        });
    }

    public entry fun reset_daily_spend(
        record: &mut SpendRecord,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let current_epoch = tx_context::epoch(ctx);
        if (record.epoch < current_epoch) {
            record.epoch = current_epoch;
            record.spent_today = 0;
        };
    }

    // ═══════════════════════════════════════
    // Public accessors
    // ═══════════════════════════════════════

    public fun cap_active(cap: &DelegationCap): bool {
        cap.active
    }

    public fun cap_agent_id(cap: &DelegationCap): ID {
        cap.agent_id
    }

    public fun cap_daily_limit(cap: &DelegationCap): u64 {
        cap.daily_limit
    }

    public fun cap_max_per_tx(cap: &DelegationCap): u64 {
        cap.max_per_tx
    }

    public fun spend_record_remaining(cap: &DelegationCap, record: &SpendRecord): u64 {
        cap.daily_limit - record.spent_today
    }

    // ═══════════════════════════════════════
    // Tests
    // ═══════════════════════════════════════

    #[test_only]
    public fun destroy_cap_for_testing(cap: DelegationCap) {
        let DelegationCap {
            id, agent_id: _, delegator: _, allowed_modules: _,
            max_per_tx: _, daily_limit: _, expiry_epoch: _,
            revocable: _, active: _,
        } = cap;
        object::delete(id);
    }

    #[test_only]
    public fun destroy_record_for_testing(record: SpendRecord) {
        let SpendRecord { id, cap_id: _, epoch: _, spent_today: _ } = record;
        object::delete(id);
    }

    #[test_only]
    module tests {
        use sui::test_scenario;
        use sui::clock;
        use sui::object;
        use sui_agent_kit::sui_agent_policy::{Self, DelegationCap, SpendRecord};

        #[test]
        fun test_create_cap() {
            let delegator = @0xA;
            let mut scenario = test_scenario::begin(delegator);
            let ctx = scenario.ctx();
            let agent_id = object::id_from_address(@0xB);

            sui_agent_policy::create_cap(
                agent_id,
                vector[b"payments", b"tasks"],
                100_000_000, // 0.1 SUI
                1_000_000_000, // 1 SUI daily
                100, // expires at epoch 100
                true,
                ctx,
            );

            scenario.next_tx(delegator);
            {
                let cap = scenario.take_from_sender<DelegationCap>();
                assert!(sui_agent_policy::cap_active(&cap));
                assert!(sui_agent_policy::cap_agent_id(&cap) == agent_id);
                scenario.return_to_sender(cap);

                let record = scenario.take_from_sender<SpendRecord>();
                scenario.return_to_sender(record);
            };

            scenario.end();
        }

        #[test]
        fun test_revoke_cap() {
            let delegator = @0xA;
            let mut scenario = test_scenario::begin(delegator);
            let ctx = scenario.ctx();
            let agent_id = object::id_from_address(@0xB);

            sui_agent_policy::create_cap(
                agent_id,
                vector[b"payments"],
                100_000_000,
                1_000_000_000,
                100,
                true,
                ctx,
            );

            scenario.next_tx(delegator);
            {
                let mut cap = scenario.take_from_sender<DelegationCap>();
                let ctx = scenario.ctx();
                sui_agent_policy::revoke_cap(&mut cap, ctx);
                assert!(!sui_agent_policy::cap_active(&cap));
                scenario.return_to_sender(cap);
            };

            scenario.end();
        }

        #[test]
        fun test_authorize_spend() {
            let delegator = @0xA;
            let mut scenario = test_scenario::begin(delegator);
            let ctx = scenario.ctx();
            let agent_id = object::id_from_address(@0xB);

            sui_agent_policy::create_cap(
                agent_id,
                vector[b"payments"],
                500_000_000,
                1_000_000_000,
                100,
                true,
                ctx,
            );

            scenario.next_tx(delegator);
            {
                let cap = scenario.take_from_sender<DelegationCap>();
                let mut record = scenario.take_from_sender<SpendRecord>();
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();

                sui_agent_policy::authorize_spend(
                    &cap,
                    &mut record,
                    b"payments",
                    200_000_000,
                    &clock,
                    ctx,
                );

                assert!(sui_agent_policy::spend_record_remaining(&cap, &record) == 800_000_000);

                clock::destroy_for_testing(clock);
                scenario.return_to_sender(cap);
                scenario.return_to_sender(record);
            };

            scenario.end();
        }
    }
}
