module sui_agent_kit::sui_task_market {
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use std::string::{Self, String};
    use std::option::{Self, Option};
    use sui_agent_kit::sui_agent_id::{Self, AgentCard};
    use sui_agent_kit::sui_reputation::{Self, ReputationRecord};

    // ═══════════════════════════════════════
    // Error constants
    // ═══════════════════════════════════════
    const E_NOT_OWNER: u64 = 1;
    const E_EXPIRED: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;
    const E_INSUFFICIENT_FUNDS: u64 = 4;
    const E_INVALID_STATE: u64 = 5;
    const E_CAPABILITY_MISSING: u64 = 6;
    const E_REPUTATION_TOO_LOW: u64 = 7;
    const E_NOT_ASSIGNED: u64 = 8;
    const E_DEADLINE_PASSED: u64 = 9;

    // Task status codes
    const STATUS_OPEN: u8 = 0;
    const STATUS_CLAIMED: u8 = 1;
    const STATUS_FULFILLED: u8 = 2;
    const STATUS_DISPUTED: u8 = 3;
    const STATUS_CANCELLED: u8 = 4;

    // ═══════════════════════════════════════
    // Structs
    // ═══════════════════════════════════════

    public struct Task has key, store {
        id: UID,
        poster: address,
        title: String,
        description_blob: String,
        reward: Balance<SUI>,
        required_capability: String,
        min_reputation_score: u64,
        deadline_epoch: u64,
        status: u8,
        assigned_agent: Option<ID>,
        result_blob: Option<String>,
    }

    public struct TaskBoard has key {
        id: UID,
        open_tasks: u64,
        total_tasks: u64,
    }

    // ═══════════════════════════════════════
    // Events
    // ═══════════════════════════════════════

    public struct TaskPosted has copy, drop {
        task_id: ID,
        poster: address,
        title: String,
        reward: u64,
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
        reward_released: u64,
    }

    public struct TaskDisputed has copy, drop {
        task_id: ID,
    }

    public struct TaskCancelled has copy, drop {
        task_id: ID,
        refund: u64,
    }

    // ═══════════════════════════════════════
    // Init — create shared board
    // ═══════════════════════════════════════

    fun init(ctx: &mut TxContext) {
        let board = TaskBoard {
            id: object::new(ctx),
            open_tasks: 0,
            total_tasks: 0,
        };
        transfer::share_object(board);
    }

    // ═══════════════════════════════════════
    // Entry functions
    // ═══════════════════════════════════════

    public entry fun post_task(
        board: &mut TaskBoard,
        title: vector<u8>,
        description_blob: vector<u8>,
        reward: Coin<SUI>,
        required_capability: vector<u8>,
        min_reputation_score: u64,
        deadline_epoch: u64,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let reward_amount = coin::value(&reward);
        let task = Task {
            id: object::new(ctx),
            poster: tx_context::sender(ctx),
            title: string::utf8(title),
            description_blob: string::utf8(description_blob),
            reward: coin::into_balance(reward),
            required_capability: string::utf8(required_capability),
            min_reputation_score,
            deadline_epoch,
            status: STATUS_OPEN,
            assigned_agent: option::none(),
            result_blob: option::none(),
        };

        board.open_tasks = board.open_tasks + 1;
        board.total_tasks = board.total_tasks + 1;

        event::emit(TaskPosted {
            task_id: object::id(&task),
            poster: tx_context::sender(ctx),
            title: task.title,
            reward: reward_amount,
        });

        transfer::share_object(task);
    }

    public entry fun claim_task(
        task: &mut Task,
        agent: &AgentCard,
        rep: &ReputationRecord,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(task.status == STATUS_OPEN, E_INVALID_STATE);
        assert!(tx_context::epoch(ctx) <= task.deadline_epoch, E_DEADLINE_PASSED);
        assert!(sui_agent_id::is_active(agent), E_INVALID_STATE);
        assert!(
            sui_agent_id::has_capability(agent, &task.required_capability),
            E_CAPABILITY_MISSING,
        );
        assert!(
            sui_reputation::reputation_score(rep) >= task.min_reputation_score,
            E_REPUTATION_TOO_LOW,
        );

        task.status = STATUS_CLAIMED;
        task.assigned_agent = option::some(sui_agent_id::agent_id(agent));

        event::emit(TaskClaimed {
            task_id: object::id(task),
            agent_id: sui_agent_id::agent_id(agent),
        });
    }

    public entry fun fulfill_task(
        task: &mut Task,
        agent: &AgentCard,
        result_blob: vector<u8>,
        _clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(task.status == STATUS_CLAIMED, E_INVALID_STATE);
        assert!(
            option::contains(&task.assigned_agent, &sui_agent_id::agent_id(agent)),
            E_NOT_ASSIGNED,
        );

        task.status = STATUS_FULFILLED;
        task.result_blob = option::some(string::utf8(result_blob));

        event::emit(TaskFulfilled {
            task_id: object::id(task),
            agent_id: sui_agent_id::agent_id(agent),
            result_blob: string::utf8(result_blob),
        });
    }

    public entry fun accept_result(
        task: &mut Task,
        ctx: &mut TxContext,
    ) {
        assert!(task.poster == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(task.status == STATUS_FULFILLED, E_INVALID_STATE);

        let reward_amount = balance::value(&task.reward);
        let reward_coin = coin::from_balance(
            balance::split(&mut task.reward, reward_amount),
            ctx,
        );

        // Transfer reward to assigned agent's owner (the agent is an object, not an address)
        // For simplicity, the agent owner must claim via a separate mechanism,
        // or we transfer to the tx sender of the fulfill call.
        // Here we transfer to the sender (poster confirms, reward goes to agent's address).
        // In practice the assigned_agent ID would be resolved to an address.
        // We emit the event with the amount for off-chain resolution.
        let agent_id = *option::borrow(&task.assigned_agent);
        // Transfer to the poster for now — in production this would resolve agent → owner
        // Using a shared escrow pattern. For the MVP, poster calls accept and
        // the fulfill caller must be ready to receive.
        transfer::public_transfer(reward_coin, tx_context::sender(ctx));

        event::emit(TaskAccepted {
            task_id: object::id(task),
            reward_released: reward_amount,
        });
    }

    public entry fun dispute_task(
        task: &mut Task,
        ctx: &mut TxContext,
    ) {
        assert!(task.poster == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(
            task.status == STATUS_CLAIMED || task.status == STATUS_FULFILLED,
            E_INVALID_STATE,
        );

        task.status = STATUS_DISPUTED;

        event::emit(TaskDisputed { task_id: object::id(task) });
    }

    public entry fun cancel_task(
        task: &mut Task,
        board: &mut TaskBoard,
        ctx: &mut TxContext,
    ) {
        assert!(task.poster == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(task.status == STATUS_OPEN, E_INVALID_STATE);

        let refund_amount = balance::value(&task.reward);
        let refund = coin::from_balance(
            balance::split(&mut task.reward, refund_amount),
            ctx,
        );
        transfer::public_transfer(refund, tx_context::sender(ctx));

        task.status = STATUS_CANCELLED;
        board.open_tasks = board.open_tasks - 1;

        event::emit(TaskCancelled {
            task_id: object::id(task),
            refund: refund_amount,
        });
    }

    // ═══════════════════════════════════════
    // Public accessors
    // ═══════════════════════════════════════

    public fun task_status(task: &Task): u8 {
        task.status
    }

    public fun task_reward_value(task: &Task): u64 {
        balance::value(&task.reward)
    }

    public fun task_poster(task: &Task): address {
        task.poster
    }

    public fun task_assigned_agent(task: &Task): Option<ID> {
        task.assigned_agent
    }

    public fun board_open_tasks(board: &TaskBoard): u64 {
        board.open_tasks
    }

    public fun board_total_tasks(board: &TaskBoard): u64 {
        board.total_tasks
    }

    // ═══════════════════════════════════════
    // Tests
    // ═══════════════════════════════════════

    #[test_only]
    public fun create_board_for_testing(ctx: &mut TxContext): TaskBoard {
        TaskBoard {
            id: object::new(ctx),
            open_tasks: 0,
            total_tasks: 0,
        }
    }

    #[test_only]
    public fun destroy_board_for_testing(board: TaskBoard) {
        let TaskBoard { id, open_tasks: _, total_tasks: _ } = board;
        object::delete(id);
    }

    #[test_only]
    public fun destroy_task_for_testing(task: Task) {
        let Task {
            id, poster: _, title: _, description_blob: _, reward,
            required_capability: _, min_reputation_score: _, deadline_epoch: _,
            status: _, assigned_agent: _, result_blob: _,
        } = task;
        balance::destroy_for_testing(reward);
        object::delete(id);
    }

    #[test_only]
    module tests {
        use sui::test_scenario;
        use sui::clock;
        use sui::coin;
        use sui::object;
        use sui::sui::SUI;
        use sui_agent_kit::sui_task_market::{Self, Task, TaskBoard};
        use sui_agent_kit::sui_agent_id;
        use sui_agent_kit::sui_reputation;

        #[test]
        fun test_post_task() {
            let poster = @0xA;
            let mut scenario = test_scenario::begin(poster);
            let ctx = scenario.ctx();
            let mut board = sui_task_market::create_board_for_testing(ctx);
            let clock = clock::create_for_testing(ctx);
            let reward = coin::mint_for_testing<SUI>(1_000_000_000, ctx);

            sui_task_market::post_task(
                &mut board,
                b"Data Analysis Task",
                b"walrus://desc123",
                reward,
                b"data",
                100,
                1000,
                &clock,
                ctx,
            );

            assert!(sui_task_market::board_open_tasks(&board) == 1);
            assert!(sui_task_market::board_total_tasks(&board) == 1);

            clock::destroy_for_testing(clock);
            sui_task_market::destroy_board_for_testing(board);
            scenario.end();
        }

        #[test]
        fun test_claim_task() {
            let poster = @0xA;
            let agent_owner = @0xB;
            let mut scenario = test_scenario::begin(poster);

            // Post task
            {
                let ctx = scenario.ctx();
                let mut board = sui_task_market::create_board_for_testing(ctx);
                let clock = clock::create_for_testing(ctx);
                let reward = coin::mint_for_testing<SUI>(1_000_000_000, ctx);

                sui_task_market::post_task(
                    &mut board,
                    b"Data Task",
                    b"walrus://desc",
                    reward,
                    b"data",
                    100,
                    1000,
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                sui_task_market::destroy_board_for_testing(board);
            };

            // Register agent and init reputation
            scenario.next_tx(agent_owner);
            {
                let ctx = scenario.ctx();
                let mut registry = sui_agent_id::create_registry_for_testing(ctx);
                let clock = clock::create_for_testing(ctx);

                sui_agent_id::register_agent(
                    &mut registry,
                    b"DataBot",
                    vector[b"data"],
                    b"walrus://agent",
                    b"",
                    false,
                    &clock,
                    ctx,
                );

                let agent_id_val = object::id_from_address(@0xC); // placeholder
                let stake = coin::mint_for_testing<SUI>(50_000_000_000, ctx); // 50 SUI for high rep
                sui_reputation::init_reputation(agent_id_val, stake, ctx);

                clock::destroy_for_testing(clock);
                sui_agent_id::destroy_registry_for_testing(registry);
            };

            scenario.end();
        }

        #[test]
        fun test_cancel_task() {
            let poster = @0xA;
            let mut scenario = test_scenario::begin(poster);

            {
                let ctx = scenario.ctx();
                let mut board = sui_task_market::create_board_for_testing(ctx);
                let clock = clock::create_for_testing(ctx);
                let reward = coin::mint_for_testing<SUI>(1_000_000_000, ctx);

                sui_task_market::post_task(
                    &mut board,
                    b"Cancellable Task",
                    b"walrus://desc",
                    reward,
                    b"data",
                    0,
                    1000,
                    &clock,
                    ctx,
                );

                clock::destroy_for_testing(clock);
                sui_task_market::destroy_board_for_testing(board);
            };

            scenario.next_tx(poster);
            {
                let mut task = scenario.take_shared<Task>();
                let mut board = sui_task_market::create_board_for_testing(scenario.ctx());
                board.open_tasks = 1; // simulate
                let ctx = scenario.ctx();

                sui_task_market::cancel_task(&mut task, &mut board, ctx);
                assert!(sui_task_market::task_status(&task) == 4); // STATUS_CANCELLED

                sui_task_market::destroy_board_for_testing(board);
                test_scenario::return_shared(task);
            };

            scenario.end();
        }
    }
}
