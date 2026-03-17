import { SuiClient } from "@mysten/sui/client";
import { Keypair } from "@mysten/sui/cryptography";
import type {
  AgentCard,
  DelegationCap,
  PaymentRequest,
  Receipt,
  ReputationRecord,
  Task,
  PaymentStream,
  AgentMessage,
  MemoryAnchor,
  RegisterAgentParams,
  CreateDelegationCapParams,
  CreatePaymentRequestParams,
  PostTaskParams,
  OpenStreamParams,
  SendMessageParams,
  StoreMemoryParams,
  TransactionResult,
  MemoryType,
} from "./types";

import * as agentMod from "./agent";
import * as policyMod from "./policy";
import * as x402Mod from "./x402";
import * as reputationMod from "./reputation";
import * as taskMod from "./task";
import * as streamMod from "./stream";
import * as a2aMod from "./a2a";
import * as memoryMod from "./memory";

export class SuiAgentKit {
  public readonly client: SuiClient;
  public readonly signer: Keypair;
  public readonly packageId: string;

  public readonly agents: AgentModule;
  public readonly policies: PolicyModule;
  public readonly payments: PaymentModule;
  public readonly reputation: ReputationModule;
  public readonly tasks: TaskModule;
  public readonly streams: StreamModule;
  public readonly messages: MessageModule;
  public readonly memory: MemoryModule;

  constructor(client: SuiClient, signer: Keypair, packageId: string) {
    this.client = client;
    this.signer = signer;
    this.packageId = packageId;

    this.agents = new AgentModule(this);
    this.policies = new PolicyModule(this);
    this.payments = new PaymentModule(this);
    this.reputation = new ReputationModule(this);
    this.tasks = new TaskModule(this);
    this.streams = new StreamModule(this);
    this.messages = new MessageModule(this);
    this.memory = new MemoryModule(this);
  }
}

class AgentModule {
  constructor(private kit: SuiAgentKit) {}

  register(params: RegisterAgentParams): Promise<TransactionResult> {
    return agentMod.registerAgent(
      { ...params, packageId: this.kit.packageId },
      this.kit.client,
      this.kit.signer
    );
  }

  get(agentId: string): Promise<AgentCard | null> {
    return agentMod.getAgent(this.kit.client, agentId);
  }

  hasCapability(agentId: string, capability: string): Promise<boolean> {
    return agentMod.hasCapability(this.kit.client, agentId, capability);
  }

  listByOwner(owner: string): Promise<AgentCard[]> {
    return agentMod.listAgentsByOwner(
      this.kit.client,
      owner,
      this.kit.packageId
    );
  }
}

class PolicyModule {
  constructor(private kit: SuiAgentKit) {}

  createCap(params: CreateDelegationCapParams): Promise<TransactionResult> {
    return policyMod.createDelegationCap(
      { ...params, packageId: this.kit.packageId },
      this.kit.client,
      this.kit.signer
    );
  }

  revoke(capId: string): Promise<TransactionResult> {
    return policyMod.revokeCap(
      capId,
      this.kit.packageId,
      this.kit.client,
      this.kit.signer
    );
  }

  get(capId: string): Promise<DelegationCap | null> {
    return policyMod.getCap(this.kit.client, capId);
  }

  checkAuthorization(
    capId: string,
    moduleName: string,
    amount: number
  ): Promise<boolean> {
    return policyMod.checkAuthorization(
      this.kit.client,
      capId,
      moduleName,
      amount
    );
  }
}

class PaymentModule {
  constructor(private kit: SuiAgentKit) {}

  createRequest(
    params: CreatePaymentRequestParams
  ): Promise<TransactionResult> {
    return x402Mod.createPaymentRequest(
      { ...params, packageId: this.kit.packageId },
      this.kit.client,
      this.kit.signer
    );
  }

  fulfill(requestId: string): Promise<TransactionResult> {
    return x402Mod.fulfillRequest(
      requestId,
      this.kit.packageId,
      this.kit.client,
      this.kit.signer
    );
  }

  verifyReceipt(receiptId: string, requestId: string): Promise<boolean> {
    return x402Mod.verifyReceipt(this.kit.client, receiptId, requestId);
  }

  middleware(options: { maxAmount: number }) {
    return x402Mod.sui402Middleware({
      client: this.kit.client,
      signer: this.kit.signer,
      packageId: this.kit.packageId,
      maxAmount: options.maxAmount,
    });
  }
}

class ReputationModule {
  constructor(private kit: SuiAgentKit) {}

  init(agentId: string, stakeAmount: number): Promise<TransactionResult> {
    return reputationMod.initReputation(
      agentId,
      stakeAmount,
      this.kit.packageId,
      this.kit.client,
      this.kit.signer
    );
  }

  addStake(recordId: string, amount: number): Promise<TransactionResult> {
    return reputationMod.addStake(
      recordId,
      amount,
      this.kit.packageId,
      this.kit.client,
      this.kit.signer
    );
  }

  get(recordId: string): Promise<ReputationRecord | null> {
    return reputationMod.getReputation(this.kit.client, recordId);
  }

  listByOwner(owner: string): Promise<ReputationRecord[]> {
    return reputationMod.getReputationByAgent(
      this.kit.client,
      owner,
      this.kit.packageId
    );
  }
}

class TaskModule {
  constructor(private kit: SuiAgentKit) {}

  post(params: PostTaskParams): Promise<TransactionResult> {
    return taskMod.postTask(
      { ...params, packageId: this.kit.packageId },
      this.kit.client,
      this.kit.signer
    );
  }

  claim(
    taskId: string,
    agentId: string,
    reputationId: string
  ): Promise<TransactionResult> {
    return taskMod.claimTask(
      taskId,
      agentId,
      reputationId,
      this.kit.packageId,
      this.kit.client,
      this.kit.signer
    );
  }

  fulfill(
    taskId: string,
    agentId: string,
    resultBlob: string
  ): Promise<TransactionResult> {
    return taskMod.fulfillTask(
      taskId,
      agentId,
      resultBlob,
      this.kit.packageId,
      this.kit.client,
      this.kit.signer
    );
  }

  accept(taskId: string): Promise<TransactionResult> {
    return taskMod.acceptResult(
      taskId,
      this.kit.packageId,
      this.kit.client,
      this.kit.signer
    );
  }

  getOpen(capability?: string): Promise<Task[]> {
    return taskMod.getOpenTasks(
      this.kit.client,
      this.kit.packageId,
      capability
    );
  }

  getByAgent(agentId: string): Promise<Task[]> {
    return taskMod.getTasksByAgent(
      this.kit.client,
      this.kit.packageId,
      agentId
    );
  }
}

class StreamModule {
  constructor(private kit: SuiAgentKit) {}

  open(params: OpenStreamParams): Promise<TransactionResult> {
    return streamMod.openStream(
      { ...params, packageId: this.kit.packageId },
      this.kit.client,
      this.kit.signer
    );
  }

  claim(streamId: string): Promise<TransactionResult> {
    return streamMod.claimStream(
      streamId,
      this.kit.packageId,
      this.kit.client,
      this.kit.signer
    );
  }

  topUp(streamId: string, amount: number): Promise<TransactionResult> {
    return streamMod.topUp(
      streamId,
      amount,
      this.kit.packageId,
      this.kit.client,
      this.kit.signer
    );
  }

  close(streamId: string): Promise<TransactionResult> {
    return streamMod.closeStream(
      streamId,
      this.kit.packageId,
      this.kit.client,
      this.kit.signer
    );
  }

  getBalance(streamId: string): Promise<number> {
    return streamMod.getStreamBalance(this.kit.client, streamId);
  }
}

class MessageModule {
  constructor(private kit: SuiAgentKit) {}

  send(params: SendMessageParams): Promise<TransactionResult> {
    return a2aMod.sendMessage(
      { ...params, packageId: this.kit.packageId },
      this.kit.client,
      this.kit.signer
    );
  }

  acknowledge(
    msgId: string,
    payloadBlob: string
  ): Promise<TransactionResult> {
    return a2aMod.acknowledgeMessage(
      msgId,
      payloadBlob,
      this.kit.packageId,
      this.kit.client,
      this.kit.signer
    );
  }

  getInbox(address: string): Promise<AgentMessage[]> {
    return a2aMod.getInbox(this.kit.client, address, this.kit.packageId);
  }

  getPendingAcks(address: string): Promise<AgentMessage[]> {
    return a2aMod.getPendingAcks(
      this.kit.client,
      address,
      this.kit.packageId
    );
  }
}

class MemoryModule {
  constructor(private kit: SuiAgentKit) {}

  store(params: StoreMemoryParams): Promise<TransactionResult> {
    return memoryMod.storeMemory(
      { ...params, packageId: this.kit.packageId },
      this.kit.client,
      this.kit.signer
    );
  }

  get(anchorId: string): Promise<MemoryAnchor | null> {
    return memoryMod.getMemory(this.kit.client, anchorId);
  }

  list(owner: string, memoryType?: MemoryType): Promise<MemoryAnchor[]> {
    return memoryMod.listAgentMemory(
      this.kit.client,
      owner,
      this.kit.packageId,
      memoryType
    );
  }

  verify(anchorId: string, hash: Uint8Array): Promise<boolean> {
    return memoryMod.verifyMemoryIntegrity(this.kit.client, anchorId, hash);
  }

  upload(content: Uint8Array, epochs: number): Promise<string> {
    return memoryMod.uploadToWalrus(content, epochs);
  }
}
