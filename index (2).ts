/// sui_agent_policy — Delegation policies with spending caps.
/// Google AP2 equivalent: on-chain DelegationCap with epoch-based daily limits.
module sui_agent_kit::sui_agent_policy {
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
    const E_NOT_DELEGATOR: u64 = 0;
    const E_CAP_EXPIRED: u64 = 1;
    const E_CAP_REVOKED: u64 = 2;
    const E_MODULE_NOT_ALLOWED: u64 = 3;
    const E_EXCEEDS_PER_TX: u64 = 4;
    const E_EXCEEDS_DAILY: u64 = 5;
    const E_NOT_REVOCABLE: u64 = 6;

    // ===== Objects =====

    /// A delegation capability granting an agent constrained authority.
    public struct DelegationCap has key, store {
        id: UID,
        agent_id: address,
        delegator: address,
        allowed_modules: VecSet<String>,
        max_per_tx: u64,
        daily_limit: u64,
        expiry_epoch: u64,
        revocable: bool,
        active: bool,
    }

    /// Tracks daily spend per DelegationCap per epoch.
    public struct SpendRecord has key {
        id: UID,
        cap_id: address,
        epoch: u64,
        spent_today: u64,
    }

    // ===== Events =====

    public struct DelegationCreated has copy, drop {
        cap_id: address,
        agent_id: address,
        delegator: address,
        max_per_tx: u64,
        daily_limit: u64,
    }

    public struct DelegationRevoked has copy, drop {
        cap_id: address,
        delegator: address,
    }

    public struct SpendRecorded has copy, drop {
        cap_id: address,
        module_name: String,
        amount: u64,
        epoch: u64,
    }

    // ===== Public functions =====

    /// Create a new DelegationCap for an agent.
    public entry fun create_delegation_cap(
        agent_id: address,
        allowed_modules: vector<vector<u8>>,
        max_per_tx: u64,
        daily_limit: u64,
        expiry_epoch: u64,
        revocable: bool,
        ctx: &mut TxContext,
    ) {
        let delegator = tx_context::sender(ctx);

        let mut module_set = vec_set::empty<String>();
        let mut i = 0;
        let len = vector::length(&allowed_modules);
        while (i < len) {
            vec_set::insert(&mut module_set, string::utf8(*vector::borrow(&allowed_modules, i)));
            i = i + 1;
        };

        let cap = DelegationCap {
            id: object::new(ctx),
            agent_id,
            delegator,
            allowed_modules: module_set,
            max_per_tx,
            daily_limit,
            expiry_epoch,
            revocable,
            active: true,
        };

        let cap_addr = object::uid_to_address(&cap.id);

        event::emit(DelegationCreated {
            cap_id: cap_addr,
            agent_id,
            delegator,
            max_per_tx,
            daily_limit,
        });

        transfer::transfer(cap, delegator);
    }

    /// Revoke a delegation cap (delegator only, must be revocable).
    public entry fun revoke(
        cap: &mut DelegationCap,
        ctx: &mut TxContext,
    ) {
        assert!(cap.delegator == tx_context::sender(ctx), E_NOT_DELEGATOR);
        assert!(cap.revocable, E_NOT_REVOCABLE);
        assert!(cap.active, E_CAP_REVOKED);

        cap.active = false;

        event::emit(DelegationRevoked {
            cap_id: object::uid_to_address(&cap.id),
            delegator: cap.delegator,
        });
    }

    /// Check authorization: is this module/amount allowed under the cap?
    /// Also records spend. Aborts if not authorized.
    public fun authorize_and_record(
        cap: &mut DelegationCap,
        record: &mut SpendRecord,
        module_name: String,
        amount: u64,
        ctx: &mut TxContext,
    ): bool {
        assert!(cap.active, E_CAP_REVOKED);

        let current_epoch = tx_context::epoch(ctx);
        assert!(current_epoch <= cap.expiry_epoch, E_CAP_EXPIRED);

        // Check module allowlist
        assert!(vec_set::contains(&cap.allowed_modules, &module_name), E_MODULE_NOT_ALLOWED);

        // Check per-tx limit
        assert!(amount <= cap.max_per_tx, E_EXCEEDS_PER_TX);

        // Reset spend record if new epoch
        if (record.epoch < current_epoch) {
            record.epoch = current_epoch;
            record.spent_today = 0;
        };

        // Check daily limit
        assert!(record.spent_today + amount <= cap.daily_limit, E_EXCEEDS_DAILY);

        // Record spend
        record.spent_today = record.spent_today + amount;

        event::emit(SpendRecorded {
            cap_id: object::uid_to_address(&cap.id),
            module_name,
            amount,
            epoch: current_epoch,
        });

        true
    }

    /// Create a SpendRecord for a new cap.
    public entry fun init_spend_record(
        cap_id: address,
        ctx: &mut TxContext,
    ) {
        let record = SpendRecord {
            id: object::new(ctx),
            cap_id,
            epoch: tx_context::epoch(ctx),
            spent_today: 0,
        };
        transfer::share_object(record);
    }

    // ===== View =====

    public fun is_active(cap: &DelegationCap): bool { cap.active }
    public fun agent_id(cap: &DelegationCap): address { cap.agent_id }
    public fun delegator(cap: &DelegationCap): address { cap.delegator }
    public fun max_per_tx(cap: &DelegationCap): u64 { cap.max_per_tx }
    public fun daily_limit(cap: &DelegationCap): u64 { cap.daily_limit }
    public fun expiry_epoch(cap: &DelegationCap): u64 { cap.expiry_epoch }
    public fun spent_today(record: &SpendRecord): u64 { record.spent_today }
    public fun record_epoch(record: &SpendRecord): u64 { record.epoch }
}
