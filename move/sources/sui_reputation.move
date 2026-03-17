/// Module 4 — Agent Reputation & Attestation
/// Analogous to ERC-8004 on-chain reputation registry.
/// Stake-weighted score: score = (completed/(completed+disputed))*500
///                               + (stake_mist / 10) capped at 1000.
module sui_agent_kit::sui_reputation {
    use std::string::String;
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};

    // ─── Error constants ───────────────────────────────────────────────────
    const E_NOT_OWNER: u64 = 1;
    const E_UNAUTHORIZED: u64 = 3;
    const E_INVALID_STATE: u64 = 5;

    const MAX_SCORE: u64 = 1000;
    const STAKE_DIVISOR: u64 = 10;

    // ─── Structs ───────────────────────────────────────────────────────────

    /// Owned record for a single agent's reputation.
    public struct ReputationRecord has key, store {
        id: UID,
        agent_id: ID,
        stake: Balance<SUI>,
        completed_tasks: u64,
        disputed_tasks: u64,
        score: u64,              // 0–1000
        total_earned: u64,
    }

    /// Attestation from one agent to another, anchored to a task.
    public struct Attestation has key, store {
        id: UID,
        from_agent: ID,
        to_agent: ID,
        task_id: ID,
        rating: u8,              // 1–5
        proof_of_payment: ID,    // links to Receipt object
        comment_blob: String,    // Walrus CID
        timestamp: u64,
    }

    // ─── Events ────────────────────────────────────────────────────────────

    public struct ReputationInitialised has copy, drop {
        record_id: ID,
        agent_id: ID,
    }

    public struct Attested has copy, drop {
        attestation_id: ID,
        from_agent: ID,
        to_agent: ID,
        rating: u8,
    }

    public struct Slashed has copy, drop {
        record_id: ID,
        amount: u64,
    }

    // ─── Entry functions ───────────────────────────────────────────────────

    /// Initialise a reputation record for an agent with an initial SUI stake.
    public entry fun init_reputation(
        agent_id: ID,
        stake: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let owner = tx_context::sender(ctx);
        let stake_balance = coin::into_balance(stake);

        let record = ReputationRecord {
            id: object::new(ctx),
            agent_id,
            stake: stake_balance,
            completed_tasks: 0,
            disputed_tasks: 0,
            score: 0,
            total_earned: 0,
        };

        event::emit(ReputationInitialised {
            record_id: object::id(&record),
            agent_id,
        });

        transfer::transfer(record, owner);
    }

    /// Add more stake to an existing ReputationRecord.
    public entry fun add_stake(record: &mut ReputationRecord, extra: Coin<SUI>) {
        let extra_balance = coin::into_balance(extra);
        balance::join(&mut record.stake, extra_balance);
        recalculate_score(record);
    }

    /// Slash the agent's stake by `amount` (callable only by dispute_resolver).
    /// In production this would be gated by a capability; here we keep it simple.
    public entry fun slash(
        record: &mut ReputationRecord,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        assert!(balance::value(&record.stake) >= amount, E_UNAUTHORIZED);
        let slashed = balance::split(&mut record.stake, amount);
        // Burn slashed balance by sending it to the zero address via a Coin
        let slashed_coin = coin::from_balance(slashed, ctx);
        transfer::public_transfer(slashed_coin, @0x0);
        record.disputed_tasks = record.disputed_tasks + 1;
        recalculate_score(record);
        event::emit(Slashed { record_id: object::id(record), amount });
    }

    /// Record an attestation from one agent to another for a completed task.
    public entry fun attest(
        from_agent: ID,
        to_record: &mut ReputationRecord,
        task_id: ID,
        rating: u8,
        proof_of_payment: ID,
        comment_blob: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(rating >= 1 && rating <= 5, E_INVALID_STATE);
        let caller = tx_context::sender(ctx);

        to_record.completed_tasks = to_record.completed_tasks + 1;
        recalculate_score(to_record);

        let attestation = Attestation {
            id: object::new(ctx),
            from_agent,
            to_agent: to_record.agent_id,
            task_id,
            rating,
            proof_of_payment,
            comment_blob,
            timestamp: clock::timestamp_ms(clock),
        };

        event::emit(Attested {
            attestation_id: object::id(&attestation),
            from_agent,
            to_agent: to_record.agent_id,
            rating,
        });

        transfer::transfer(attestation, caller);
    }

    /// Recalculate the reputation score in-place.
    public fun recalculate_score(record: &mut ReputationRecord) {
        let total = record.completed_tasks + record.disputed_tasks;
        let completion_part = if (total == 0) {
            0
        } else {
            (record.completed_tasks * 500) / total
        };

        let stake_part = balance::value(&record.stake) / STAKE_DIVISOR;
        let raw = completion_part + stake_part;
        record.score = if (raw > MAX_SCORE) { MAX_SCORE } else { raw };
    }

    // ─── Pure accessors ────────────────────────────────────────────────────

    public fun score(record: &ReputationRecord): u64 { record.score }
    public fun stake_value(record: &ReputationRecord): u64 { balance::value(&record.stake) }

    // ─── Tests ─────────────────────────────────────────────────────────────

    #[test_only]
    use sui::test_scenario;

    #[test]
    fun test_init_reputation() {
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        {
            let agent_id = object::id_from_address(@0x1);
            let coin = coin::mint_for_testing<SUI>(1_000_000_000, test_scenario::ctx(&mut scenario));
            init_reputation(agent_id, coin, test_scenario::ctx(&mut scenario));
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let record = test_scenario::take_from_sender<ReputationRecord>(&scenario);
            assert!(balance::value(&record.stake) == 1_000_000_000, 0);
            assert!(record.score == 0, 1); // no completed tasks yet
            test_scenario::return_to_sender(&scenario, record);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_score_increases_with_completions() {
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        {
            let agent_id = object::id_from_address(@0x1);
            let coin = coin::mint_for_testing<SUI>(0, test_scenario::ctx(&mut scenario));
            init_reputation(agent_id, coin, test_scenario::ctx(&mut scenario));
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut record = test_scenario::take_from_sender<ReputationRecord>(&scenario);
            record.completed_tasks = 10;
            record.disputed_tasks = 0;
            recalculate_score(&mut record);
            assert!(record.score == 500, 0); // 100% completion * 500
            test_scenario::return_to_sender(&scenario, record);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_score_capped_at_1000() {
        let owner = @0xA;
        let mut scenario = test_scenario::begin(owner);
        {
            let agent_id = object::id_from_address(@0x1);
            // Stake 10,000 SUI (1e13 MIST) — score from stake alone would be >1000
            let coin = coin::mint_for_testing<SUI>(10_000_000_000_000, test_scenario::ctx(&mut scenario));
            init_reputation(agent_id, coin, test_scenario::ctx(&mut scenario));
        };
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut record = test_scenario::take_from_sender<ReputationRecord>(&scenario);
            record.completed_tasks = 100;
            recalculate_score(&mut record);
            assert!(record.score == MAX_SCORE, 0);
            test_scenario::return_to_sender(&scenario, record);
        };
        test_scenario::end(scenario);
    }
}
