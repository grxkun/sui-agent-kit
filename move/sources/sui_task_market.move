/// Module 5 — Task Marketplace
/// Agents post bounty tasks; other agents claim, fulfill, and get paid.
/// Cross-module: reads AgentCard (Module 1) and ReputationRecord (Module 4).
module sui_agent_kit::sui_task_market {
    use std::string::String;
    use std::option::{Self, Option};
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use sui_agent_kit::sui_agent_id::{AgentCard, has_capability};
    use sui_agent_kit::sui_reputation::{ReputationRecord, score};

    // ─── Error constants ───────────────────────────────────────────────────
    const E_NOT_OWNER: u64 = 1;
    const E_EXPIRED: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;
    const E_INSUFFICIENT_FUNDS: u64 = 4;
    const E_INVALID_STATE: u64 = 5;
    const E_CAPABILITY_MISSING: u64 = 6;

    // ─── Status constants ──────────────────────────────────────────────────
    const STATUS_OPEN: u8 = 0;
    const STATUS_CLAIMED: u8 = 1;
    const STATUS_FULFILLED: u8 = 2;
    const STATUS_DISPUTED: u8 = 3;
    const STATUS_CANCELLED: u8 = 4;

    // ─── Structs ───────────────────────────────────────────────────────────

    /// A bounty task posted on the shared TaskBoard.
    public struct Task has key, store {
        id: UID,
        poster: address,
        title: String,
        description_blob: String,    // Walrus CID
        reward: Balance<SUI>,
        required_capability: String,
        min_reputation_score: u64,
        deadline_epoch: u64,
        status: u8,
        assigned_agent: Option<ID>,
        result_blob: Option<String>, // Walrus CID of delivered result
    }

    /// Shared global registry for task discovery.
    public struct TaskBoard has key {
        id: UID,
        open_tasks: u64,
        total_tasks: u64,
    }

    // ─── Events ────────────────────────────────────────────────────────────

    public struct TaskPosted has copy, drop {
        task_id: ID,
        poster: address,
        reward: u64,
        required_capability: String,
    }

    public struct TaskClaimed has copy, drop {
        task_id: ID,
        agent_id: ID,
    }

    public struct TaskFulfilled has copy, drop {
        task_id: ID,
        agent_id: ID,
        result_blob: String,
    }

    public struct TaskAccepted has copy, drop {
        task_id: ID,
        agent_id: ID,
        reward: u64,
    }

    public struct TaskDisputed has copy, drop {
        task_id: ID,
    }

    public struct TaskCancelled has copy, drop {
        task_id: ID,
    }

    // ─── Init ──────────────────────────────────────────────────────────────

    fun init(ctx: &mut TxContext) {
        let board = TaskBoard {
            id: object::new(ctx),
            open_tasks: 0,
            total_tasks: 0,
        };
        transfer::share_object(board);
    }

    // ─── Entry functions ───────────────────────────────────────────────────

    /// Post a new task with a SUI reward locked into the task object.
    public entry fun post_task(
        board: &mut TaskBoard,
        title: String,
        description_blob: String,
        reward: Coin<SUI>,
        required_capability: String,
        min_reputation_score: u64,
        deadline_epoch: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let poster = tx_context::sender(ctx);
        let reward_value = coin::value(&reward);
        assert!(reward_value > 0, E_INSUFFICIENT_FUNDS);

        let task = Task {
            id: object::new(ctx),
            poster,
            title,
            description_blob,
            reward: coin::into_balance(reward),
            required_capability,
            min_reputation_score,
            deadline_epoch,
            status: STATUS_OPEN,
            assigned_agent: option::none(),
            result_blob: option::none(),
        };

        event::emit(TaskPosted {
            task_id: object::id(&task),
            poster,
            reward: reward_value,
            required_capability: task.required_capability,
        });

        board.open_tasks = board.open_tasks + 1;
        board.total_tasks = board.total_tasks + 1;

        let _ = clock::timestamp_ms(clock);
        transfer::share_object(task);
    }

    /// Agent claims an open task (must have the required capability and rep score).
    public entry fun claim_task(
        task: &mut Task,
        agent: &AgentCard,
        rep: &ReputationRecord,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(task.status == STATUS_OPEN, E_INVALID_STATE);
        assert!(tx_context::epoch(ctx) <= task.deadline_epoch, E_EXPIRED);
        assert!(has_capability(agent, &task.required_capability), E_CAPABILITY_MISSING);
        assert!(score(rep) >= task.min_reputation_score, E_UNAUTHORIZED);

        let agent_id = sui_agent_kit::sui_agent_id::agent_id(agent);
        task.status = STATUS_CLAIMED;
        task.assigned_agent = option::some(agent_id);

        event::emit(TaskClaimed { task_id: object::id(task), agent_id });
        let _ = clock::timestamp_ms(clock);
    }

    /// Assigned agent submits the result (Walrus CID).
    public entry fun fulfill_task(
        task: &mut Task,
        agent: &AgentCard,
        result_blob: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(task.status == STATUS_CLAIMED, E_INVALID_STATE);
        assert!(tx_context::epoch(ctx) <= task.deadline_epoch, E_EXPIRED);

        let agent_id = sui_agent_kit::sui_agent_id::agent_id(agent);
        assert!(option::contains(&task.assigned_agent, &agent_id), E_UNAUTHORIZED);

        task.status = STATUS_FULFILLED;
        task.result_blob = option::some(result_blob);

        event::emit(TaskFulfilled {
            task_id: object::id(task),
            agent_id,
            result_blob: *option::borrow(&task.result_blob),
        });
        let _ = clock::timestamp_ms(clock);
    }

    /// Poster accepts the result — reward is transferred to the agent owner.
    public entry fun accept_result(
        task: &mut Task,
        board: &mut TaskBoard,
        agent: &AgentCard,
        ctx: &mut TxContext,
    ) {
        assert!(task.poster == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(task.status == STATUS_FULFILLED, E_INVALID_STATE);

        let reward_value = balance::value(&task.reward);
        let reward_coin = coin::from_balance(
            balance::split(&mut task.reward, reward_value),
            ctx,
        );

        let agent_owner = sui_agent_kit::sui_agent_id::owner(agent);
        let agent_id = sui_agent_kit::sui_agent_id::agent_id(agent);

        task.status = STATUS_CANCELLED; // reuse terminal state, reward drained
        board.open_tasks = if (board.open_tasks > 0) { board.open_tasks - 1 } else { 0 };

        event::emit(TaskAccepted {
            task_id: object::id(task),
            agent_id,
            reward: reward_value,
        });

        transfer::public_transfer(reward_coin, agent_owner);
    }

    /// Poster opens a dispute — reward stays frozen inside the task.
    public entry fun dispute_task(task: &mut Task, ctx: &mut TxContext) {
        assert!(task.poster == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(
            task.status == STATUS_FULFILLED || task.status == STATUS_CLAIMED,
            E_INVALID_STATE,
        );
        task.status = STATUS_DISPUTED;
        event::emit(TaskDisputed { task_id: object::id(task) });
    }

    /// Poster cancels an open task and reclaims the reward.
    public entry fun cancel_task(
        task: &mut Task,
        board: &mut TaskBoard,
        ctx: &mut TxContext,
    ) {
        assert!(task.poster == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(task.status == STATUS_OPEN, E_INVALID_STATE);

        let reward_value = balance::value(&task.reward);
        let reward_coin = coin::from_balance(
            balance::split(&mut task.reward, reward_value),
            ctx,
        );

        task.status = STATUS_CANCELLED;
        board.open_tasks = if (board.open_tasks > 0) { board.open_tasks - 1 } else { 0 };

        event::emit(TaskCancelled { task_id: object::id(task) });
        transfer::public_transfer(reward_coin, task.poster);
    }

    // ─── Pure accessors ────────────────────────────────────────────────────

    public fun task_status(task: &Task): u8 { task.status }
    public fun task_reward(task: &Task): u64 { balance::value(&task.reward) }

    // ─── Tests ─────────────────────────────────────────────────────────────

    #[test_only]
    use sui::test_scenario;

    #[test]
    fun test_post_and_cancel_task() {
        let poster = @0xA;
        let mut scenario = test_scenario::begin(poster);
        {
            init(test_scenario::ctx(&mut scenario));
        };
        test_scenario::next_tx(&mut scenario, poster);
        {
            let mut board = test_scenario::take_shared<TaskBoard>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let reward = coin::mint_for_testing<SUI>(1_000_000_000, test_scenario::ctx(&mut scenario));
            post_task(
                &mut board,
                std::string::utf8(b"Analyse data"),
                std::string::utf8(b"bafybeipayload"),
                reward,
                std::string::utf8(b"data"),
                100,
                100,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            assert!(board.total_tasks == 1, 0);
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_shared(board);
        };
        test_scenario::next_tx(&mut scenario, poster);
        {
            let mut task = test_scenario::take_shared<Task>(&scenario);
            let mut board = test_scenario::take_shared<TaskBoard>(&scenario);
            cancel_task(&mut task, &mut board, test_scenario::ctx(&mut scenario));
            assert!(task.status == STATUS_CANCELLED, 0);
            test_scenario::return_shared(task);
            test_scenario::return_shared(board);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_post_task_increments_board() {
        let poster = @0xA;
        let mut scenario = test_scenario::begin(poster);
        {
            init(test_scenario::ctx(&mut scenario));
        };
        test_scenario::next_tx(&mut scenario, poster);
        {
            let mut board = test_scenario::take_shared<TaskBoard>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let r1 = coin::mint_for_testing<SUI>(500_000_000, test_scenario::ctx(&mut scenario));
            let r2 = coin::mint_for_testing<SUI>(500_000_000, test_scenario::ctx(&mut scenario));
            post_task(
                &mut board,
                std::string::utf8(b"Task 1"),
                std::string::utf8(b"blob1"),
                r1,
                std::string::utf8(b"trade"),
                0,
                100,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            post_task(
                &mut board,
                std::string::utf8(b"Task 2"),
                std::string::utf8(b"blob2"),
                r2,
                std::string::utf8(b"data"),
                0,
                100,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            assert!(board.total_tasks == 2, 0);
            assert!(board.open_tasks == 2, 1);
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_shared(board);
        };
        test_scenario::end(scenario);
    }

    #[test]
    fun test_dispute_task() {
        let poster = @0xA;
        let mut scenario = test_scenario::begin(poster);
        {
            init(test_scenario::ctx(&mut scenario));
        };
        test_scenario::next_tx(&mut scenario, poster);
        {
            let mut board = test_scenario::take_shared<TaskBoard>(&scenario);
            let clock = sui::clock::create_for_testing(test_scenario::ctx(&mut scenario));
            let reward = coin::mint_for_testing<SUI>(1_000_000_000, test_scenario::ctx(&mut scenario));
            post_task(
                &mut board,
                std::string::utf8(b"Disputed"),
                std::string::utf8(b"blob3"),
                reward,
                std::string::utf8(b"trade"),
                0,
                100,
                &clock,
                test_scenario::ctx(&mut scenario),
            );
            sui::clock::destroy_for_testing(clock);
            test_scenario::return_shared(board);
        };
        test_scenario::next_tx(&mut scenario, poster);
        {
            let mut task = test_scenario::take_shared<Task>(&scenario);
            // Manually set to CLAIMED to simulate a mid-flow dispute
            task.status = STATUS_CLAIMED;
            dispute_task(&mut task, test_scenario::ctx(&mut scenario));
            assert!(task.status == STATUS_DISPUTED, 0);
            test_scenario::return_shared(task);
        };
        test_scenario::end(scenario);
    }
}
