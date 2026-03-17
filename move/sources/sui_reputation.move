module sui_agent_kit::sui_reputation {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use std::string::{Self, String};

    // ═══════════════════════════════════════
    // Error constants
    // ═══════════════════════════════════════
    const E_NOT_OWNER: u64 = 1;
    const E_EXPIRED: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;
    const E_INSUFFICIENT_FUNDS: u64 = 4;
    const E_INVALID_STATE: u64 = 5;
    const E_INVALID_RATING: u64 = 6;

    // ═══════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════

    public struct ReputationRecord has key, store {
        id: UID,
        agent_id: ID,
        stake: Balance<SUI>,
        completed_tasks: u64,
        disputed_tasks: u64,
        score: u64,
        total_earned: u64,
    }

    public struct Attestation has key, store {
        id: UID,
        from_agent: ID,
        to_agent: ID,
        task_id: ID,
        rating: u8,
        proof_of_payment: ID,
        comment_blob: String,
        timestamp: u64,
    }

    // ═══════════════════════════════════════
    // Events
    // ═══════════════════════════════════════

    public struct ReputationInitialized has copy, drop {
        record_id: ID,
        agent_id: ID,
        initial_stake: u64,
    }

    public struct StakeAdded has copy, drop {
        record_id: ID,
        amount: u64,
    }

    public struct StakeSlashed has copy, drop {
        record_id: ID,
        amount: u64,
    }

    public struct AttestationCreated has copy, drop {
        attestation_id: ID,
        from_agent: ID,
        to_agent: ID,
        rating: u8,
    }

    public struct ScoreRecalculated has copy, drop {
        record_id: ID,
        new_score: u64,
    }

    // ═══════════════════════════════════════
    // Entry functions
    // ═══════════════════════════════════════

    public entry fun init_reputation(
        agent_id: ID,
        stake: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let stake_amount = coin::value(&stake);
        let record = ReputationRecord {
            id: object::new(ctx),
            agent_id,
            stake: coin::into_balance(stake),
            completed_tasks: 0,
            disputed_tasks: 0,
            score: calculate_score(0, 0, stake_amount),
            total_earned: 0,
        };

        event::emit(ReputationInitialized {
            record_id: object::id(&record),
            agent_id,
            initial_stake: stake_amount,
        });

        transfer::transfer(record, tx_context::sender(ctx));
    }

    public entry fun add_stake(
        record: &mut ReputationRecord,
        extra: Coin<SUI>,
    ) {
        let amount = coin::value(&extra);
        balance::join(&mut record.stake, coin::into_balance(extra));
        recalculate_score(record);

        event::emit(StakeAdded {
            record_id: object::id(record),
            amount,
        });
    }

    public entry fun slash(
        record: &mut ReputationRecord,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        assert!(balance::value(&record.stake) >= amount, E_INSUFFICIENT_FUNDS);
        let slashed = balance::split(&mut record.stake, amount);
        // Slashed funds are burned (sent to 0x0 equivalent via destroying balance)
        let slashed_coin = coin::from_balance(slashed, ctx);
        transfer::public_transfer(slashed_coin, @0x0);

        record.disputed_tasks = record.disputed_tasks + 1;
        recalculate_score(record);

        event::emit(StakeSlashed {
            record_id: object::id(record),
            amount,
        });
    }

    public entry fun attest(
        from_agent: ID,
        to_record: &mut ReputationRecord,
        task_id: ID,
        rating: u8,
        proof_of_payment: ID,
        comment_blob: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(rating >= 1 && rating <= 5, E_INVALID_RATING);

        to_record.completed_tasks = to_record.completed_tasks + 1;
        recalculate_score(to_record);

        let attestation = Attestation {
            id: object::new(ctx),
            from_agent,
            to_agent: to_record.agent_id,
            task_id,
            rating,
            proof_of_payment,
            comment_blob: string::utf8(comment_blob),
            timestamp: clock::timestamp_ms(clock),
        };

        event::emit(AttestationCreated {
            attestation_id: object::id(&attestation),
            from_agent,
            to_agent: to_record.agent_id,
            rating,
        });

        transfer::transfer(attestation, tx_context::sender(ctx));
    }

    // score = (completed / (completed + disputed)) * 500 + (stake_sui / 10), capped at 1000
    public fun recalculate_score(record: &mut ReputationRecord) {
        let new_score = calculate_score(
            record.completed_tasks,
            record.disputed_tasks,
            balance::value(&record.stake),
        );
        record.score = new_score;

        event::emit(ScoreRecalculated {
            record_id: object::id(record),
            new_score,
        });
    }

    // ═══════════════════════════════════════
    // Pure score formula
    // ═══════════════════════════════════════

    fun calculate_score(completed: u64, disputed: u64, stake_mist: u64): u64 {
        let total_tasks = completed + disputed;
        let task_score = if (total_tasks == 0) {
            0
        } else {
            (completed * 500) / total_tasks
        };

        // stake_mist is in MIST (1 SUI = 1_000_000_000 MIST)
        // score component = stake in SUI / 10, i.e. stake_mist / 10_000_000_000
        let stake_score = stake_mist / 10_000_000_000;

        let raw = task_score + stake_score;
        if (raw > 1000) { 1000 } else { raw }
    }

    // ═══════════════════════════════════════
    // Public accessors
    // ═══════════════════════════════════════

    public fun reputation_score(record: &ReputationRecord): u64 {
        record.score
    }

    public fun reputation_agent_id(record: &ReputationRecord): ID {
        record.agent_id
    }

    public fun reputation_completed(record: &ReputationRecord): u64 {
        record.completed_tasks
    }

    public fun reputation_disputed(record: &ReputationRecord): u64 {
        record.disputed_tasks
    }

    public fun reputation_stake_value(record: &ReputationRecord): u64 {
        balance::value(&record.stake)
    }

    public fun reputation_total_earned(record: &ReputationRecord): u64 {
        record.total_earned
    }

    public fun add_earnings(record: &mut ReputationRecord, amount: u64) {
        record.total_earned = record.total_earned + amount;
    }

    // ═══════════════════════════════════════
    // Tests
    // ═══════════════════════════════════════

    #[test_only]
    public fun destroy_record_for_testing(record: ReputationRecord) {
        let ReputationRecord {
            id, agent_id: _, stake, completed_tasks: _,
            disputed_tasks: _, score: _, total_earned: _,
        } = record;
        balance::destroy_for_testing(stake);
        object::delete(id);
    }

    #[test_only]
    public fun destroy_attestation_for_testing(attestation: Attestation) {
        let Attestation {
            id, from_agent: _, to_agent: _, task_id: _,
            rating: _, proof_of_payment: _, comment_blob: _, timestamp: _,
        } = attestation;
        object::delete(id);
    }

    #[test_only]
    module tests {
        use sui::test_scenario;
        use sui::clock;
        use sui::coin;
        use sui::object;
        use sui::sui::SUI;
        use sui_agent_kit::sui_reputation::{Self, ReputationRecord, Attestation};

        #[test]
        fun test_init_reputation() {
            let owner = @0xA;
            let mut scenario = test_scenario::begin(owner);
            let ctx = scenario.ctx();
            let agent_id = object::id_from_address(@0xB);
            let stake = coin::mint_for_testing<SUI>(5_000_000_000, ctx); // 5 SUI

            sui_reputation::init_reputation(agent_id, stake, ctx);

            scenario.next_tx(owner);
            {
                let record = scenario.take_from_sender<ReputationRecord>();
                assert!(sui_reputation::reputation_stake_value(&record) == 5_000_000_000);
                assert!(sui_reputation::reputation_agent_id(&record) == agent_id);
                // score = 0 tasks completed + 5 SUI / 10 = 0 (integer division)
                scenario.return_to_sender(record);
            };

            scenario.end();
        }

        #[test]
        fun test_add_stake() {
            let owner = @0xA;
            let mut scenario = test_scenario::begin(owner);
            let ctx = scenario.ctx();
            let agent_id = object::id_from_address(@0xB);
            let stake = coin::mint_for_testing<SUI>(1_000_000_000, ctx);

            sui_reputation::init_reputation(agent_id, stake, ctx);

            scenario.next_tx(owner);
            {
                let mut record = scenario.take_from_sender<ReputationRecord>();
                let ctx = scenario.ctx();
                let extra = coin::mint_for_testing<SUI>(4_000_000_000, ctx);
                sui_reputation::add_stake(&mut record, extra);
                assert!(sui_reputation::reputation_stake_value(&record) == 5_000_000_000);
                scenario.return_to_sender(record);
            };

            scenario.end();
        }

        #[test]
        fun test_attest() {
            let owner = @0xA;
            let mut scenario = test_scenario::begin(owner);
            let ctx = scenario.ctx();
            let agent_id = object::id_from_address(@0xB);
            let from_agent = object::id_from_address(@0xC);
            let task_id = object::id_from_address(@0xD);
            let receipt_id = object::id_from_address(@0xE);
            let stake = coin::mint_for_testing<SUI>(10_000_000_000, ctx); // 10 SUI

            sui_reputation::init_reputation(agent_id, stake, ctx);

            scenario.next_tx(owner);
            {
                let mut record = scenario.take_from_sender<ReputationRecord>();
                let clock = clock::create_for_testing(scenario.ctx());
                let ctx = scenario.ctx();

                sui_reputation::attest(
                    from_agent,
                    &mut record,
                    task_id,
                    5,
                    receipt_id,
                    b"walrus://comment123",
                    &clock,
                    ctx,
                );

                assert!(sui_reputation::reputation_completed(&record) == 1);
                // score = (1/(1+0)) * 500 + 10/10 = 500 + 1 = 501
                assert!(sui_reputation::reputation_score(&record) == 501);

                clock::destroy_for_testing(clock);
                scenario.return_to_sender(record);
            };

            scenario.end();
        }
    }
}
