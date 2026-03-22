/// sui_reputation — Stake-weighted reputation with attestation proofs.
module sui_agent_kit::sui_reputation {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use std::string::{Self, String};

    // ===== Error codes =====
    const E_NOT_OWNER: u64 = 0;
    const E_INVALID_RATING: u64 = 1;
    const E_SELF_ATTEST: u64 = 2;
    const E_INSUFFICIENT_STAKE: u64 = 3;

    // ===== Score weights =====
    const WEIGHT_COMPLETED: u64 = 100;
    const WEIGHT_DISPUTED: u64 = 250;
    const BASE_SCORE: u64 = 500;

    // ===== Objects =====

    /// Reputation record anchored to an agent identity.
    public struct ReputationRecord has key, store {
        id: UID,
        agent_id: address,
        stake: Balance<SUI>,
        completed_tasks: u64,
        disputed_tasks: u64,
        score: u64,
        total_earned: u64,
    }

    /// Immutable attestation from one agent to another.
    public struct Attestation has key, store {
        id: UID,
        from_agent: address,
        to_agent: address,
        task_id: address,
        rating: u8,
        proof_of_payment: address,
        comment_blob: String,
        timestamp: u64,
    }

    // ===== Events =====

    public struct ReputationInitialized has copy, drop {
        record_id: address,
        agent_id: address,
        stake: u64,
    }

    public struct AttestationCreated has copy, drop {
        attestation_id: address,
        from_agent: address,
        to_agent: address,
        rating: u8,
        timestamp: u64,
    }

    public struct ScoreUpdated has copy, drop {
        record_id: address,
        new_score: u64,
    }

    // ===== Public functions =====

    /// Initialize a reputation record with a stake.
    public entry fun init_reputation(
        agent_id: address,
        stake: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let stake_value = coin::value(&stake);

        let record = ReputationRecord {
            id: object::new(ctx),
            agent_id,
            stake: coin::into_balance(stake),
            completed_tasks: 0,
            disputed_tasks: 0,
            score: BASE_SCORE,
            total_earned: 0,
        };

        let record_addr = object::uid_to_address(&record.id);

        event::emit(ReputationInitialized {
            record_id: record_addr,
            agent_id,
            stake: stake_value,
        });

        transfer::share_object(record);
    }

    /// Record a task completion (increases score).
    public fun record_completion(record: &mut ReputationRecord, earned: u64) {
        record.completed_tasks = record.completed_tasks + 1;
        record.total_earned = record.total_earned + earned;
        record.score = record.score + WEIGHT_COMPLETED;

        event::emit(ScoreUpdated {
            record_id: object::uid_to_address(&record.id),
            new_score: record.score,
        });
    }

    /// Record a dispute (decreases score).
    public fun record_dispute(record: &mut ReputationRecord) {
        record.disputed_tasks = record.disputed_tasks + 1;
        if (record.score >= WEIGHT_DISPUTED) {
            record.score = record.score - WEIGHT_DISPUTED;
        } else {
            record.score = 0;
        };

        event::emit(ScoreUpdated {
            record_id: object::uid_to_address(&record.id),
            new_score: record.score,
        });
    }

    /// Create an attestation from one agent to another.
    public entry fun attest(
        from_agent_id: address,
        to_reputation_record: &mut ReputationRecord,
        task_id: address,
        rating: u8,
        proof_of_payment_id: address,
        comment_blob: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(rating >= 1 && rating <= 5, E_INVALID_RATING);
        assert!(from_agent_id != to_reputation_record.agent_id, E_SELF_ATTEST);

        let now = clock::timestamp_ms(clock);

        // Update score based on rating
        if (rating >= 4) {
            to_reputation_record.score = to_reputation_record.score + ((rating as u64) * 10);
        } else if (rating <= 2) {
            let penalty = ((3 - (rating as u64)) * 15);
            if (to_reputation_record.score >= penalty) {
                to_reputation_record.score = to_reputation_record.score - penalty;
            } else {
                to_reputation_record.score = 0;
            };
        };

        let attestation = Attestation {
            id: object::new(ctx),
            from_agent: from_agent_id,
            to_agent: to_reputation_record.agent_id,
            task_id,
            rating,
            proof_of_payment: proof_of_payment_id,
            comment_blob: string::utf8(comment_blob),
            timestamp: now,
        };

        let att_addr = object::uid_to_address(&attestation.id);

        event::emit(AttestationCreated {
            attestation_id: att_addr,
            from_agent: from_agent_id,
            to_agent: to_reputation_record.agent_id,
            rating,
            timestamp: now,
        });

        transfer::freeze_object(attestation);
    }

    // ===== View =====

    public fun score(record: &ReputationRecord): u64 { record.score }
    public fun agent_id(record: &ReputationRecord): address { record.agent_id }
    public fun stake_value(record: &ReputationRecord): u64 { balance::value(&record.stake) }
    public fun completed_tasks(record: &ReputationRecord): u64 { record.completed_tasks }
    public fun disputed_tasks(record: &ReputationRecord): u64 { record.disputed_tasks }
    public fun total_earned(record: &ReputationRecord): u64 { record.total_earned }
}
