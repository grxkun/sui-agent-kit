/**
 * client.ts — SuiAgentKit unified client
 * Wraps all 8 modules into a single ergonomic object.
 */
import { SuiClient } from "@mysten/sui/client";
import type { Keypair } from "@mysten/sui/cryptography";

import * as agentModule from "./agent.js";
import * as policyModule from "./policy.js";
import * as x402Module from "./x402.js";
import * as reputationModule from "./reputation.js";
import * as taskModule from "./task.js";
import * as streamModule from "./stream.js";
import * as a2aModule from "./a2a.js";
import * as memoryModule from "./memory.js";

export interface SuiAgentKitConfig {
  /** On-chain object IDs for the shared singletons created at deploy time. */
  registryId: string;
  taskBoardId: string;
  clockId: string;
}

export class SuiAgentKit {
  readonly client: SuiClient;
  readonly signer: Keypair;
  readonly packageId: string;
  private readonly cfg: SuiAgentKitConfig;

  constructor(
    client: SuiClient,
    signer: Keypair,
    packageId: string,
    config: SuiAgentKitConfig
  ) {
    this.client = client;
    this.signer = signer;
    this.packageId = packageId;
    this.cfg = config;
  }

  // ─── Module 1: agents ─────────────────────────────────────────────────

  get agents() {
    const self = this;
    return {
      register: (
        params: Omit<agentModule.RegisterAgentParams, "packageId" | "registryId" | "clockId">
      ) =>
        agentModule.registerAgent(
          {
            ...params,
            packageId: self.packageId,
            registryId: self.cfg.registryId,
            clockId: self.cfg.clockId,
          },
          self.signer as Parameters<typeof agentModule.registerAgent>[1],
          self.client
        ),
      get: (agentId: string) => agentModule.getAgent(self.client, agentId),
      hasCapability: (agentId: string, cap: string) =>
        agentModule.hasCapability(self.client, agentId, cap),
      listByOwner: (owner: string) =>
        agentModule.listAgentsByOwner(self.client, owner, self.packageId),
    };
  }

  // ─── Module 2: policies ───────────────────────────────────────────────

  get policies() {
    const self = this;
    return {
      create: (params: Omit<policyModule.CreateDelegationCapParams, "packageId">) =>
        policyModule.createDelegationCap(
          { ...params, packageId: self.packageId },
          self.signer,
          self.client
        ),
      revoke: (capId: string) =>
        policyModule.revokeCap(self.packageId, capId, self.signer, self.client),
      get: (capId: string) => policyModule.getCap(self.client, capId),
      checkAuth: (capId: string, moduleName: string, amount: bigint) =>
        policyModule.checkAuthorization(self.client, capId, moduleName, amount),
    };
  }

  // ─── Module 3: payments (x402) ────────────────────────────────────────

  get payments() {
    const self = this;
    return {
      createRequest: (
        params: Omit<x402Module.CreatePaymentRequestParams, "packageId" | "clockId">
      ) =>
        x402Module.createPaymentRequest(
          { ...params, packageId: self.packageId, clockId: self.cfg.clockId },
          self.signer,
          self.client
        ),
      fulfill: (requestId: string) =>
        x402Module.fulfillRequest(
          self.packageId,
          requestId,
          self.cfg.clockId,
          self.signer,
          self.client
        ),
      verify: (receiptId: string, requestId: string) =>
        x402Module.verifyReceipt(self.client, receiptId, requestId),
    };
  }

  // ─── Module 4: reputation ─────────────────────────────────────────────

  get reputation() {
    const self = this;
    return {
      init: (agentId: string, stakeAmountMist: bigint) =>
        reputationModule.initReputation(
          { packageId: self.packageId, agentId, stakeAmountMist },
          self.signer,
          self.client
        ),
      addStake: (recordId: string, extraMist: bigint) =>
        reputationModule.addStake(
          self.packageId,
          recordId,
          extraMist,
          self.signer,
          self.client
        ),
      attest: (params: Omit<reputationModule.AttestParams, "packageId" | "clockId">) =>
        reputationModule.attest(
          { ...params, packageId: self.packageId, clockId: self.cfg.clockId },
          self.signer,
          self.client
        ),
      get: (recordId: string) => reputationModule.getReputation(self.client, recordId),
    };
  }

  // ─── Module 5: tasks ──────────────────────────────────────────────────

  get tasks() {
    const self = this;
    return {
      post: (params: Omit<taskModule.PostTaskParams, "packageId" | "boardId" | "clockId">) =>
        taskModule.postTask(
          {
            ...params,
            packageId: self.packageId,
            boardId: self.cfg.taskBoardId,
            clockId: self.cfg.clockId,
          },
          self.signer,
          self.client
        ),
      claim: (
        taskId: string,
        agentCardId: string,
        reputationRecordId: string
      ) =>
        taskModule.claimTask(
          self.packageId,
          taskId,
          agentCardId,
          reputationRecordId,
          self.cfg.clockId,
          self.signer,
          self.client
        ),
      fulfill: (taskId: string, agentCardId: string, resultBlob: string) =>
        taskModule.fulfillTask(
          self.packageId,
          taskId,
          agentCardId,
          resultBlob,
          self.cfg.clockId,
          self.signer,
          self.client
        ),
      getOpen: (capability?: string) =>
        taskModule.getOpenTasks(self.client, self.packageId, capability),
      getByAgent: (agentId: string) =>
        taskModule.getTasksByAgent(self.client, self.packageId, agentId),
    };
  }

  // ─── Module 6: streams ────────────────────────────────────────────────

  get streams() {
    const self = this;
    return {
      open: (params: Omit<streamModule.OpenStreamParams, "packageId" | "clockId">) =>
        streamModule.openStream(
          { ...params, packageId: self.packageId, clockId: self.cfg.clockId },
          self.signer,
          self.client
        ),
      claim: (streamId: string) =>
        streamModule.claimStream(
          self.packageId,
          streamId,
          self.cfg.clockId,
          self.signer,
          self.client
        ),
      topUp: (streamId: string, amountMist: bigint) =>
        streamModule.topUp(
          self.packageId,
          streamId,
          amountMist,
          self.signer,
          self.client
        ),
      close: (streamId: string) =>
        streamModule.closeStream(
          self.packageId,
          streamId,
          self.cfg.clockId,
          self.signer,
          self.client
        ),
      getBalance: (streamId: string) =>
        streamModule.getStreamBalance(self.client, streamId),
    };
  }

  // ─── Module 7: messages (A2A) ─────────────────────────────────────────

  get messages() {
    const self = this;
    return {
      send: (params: Omit<a2aModule.SendMessageParams, "packageId" | "clockId">) =>
        a2aModule.sendMessage(
          { ...params, packageId: self.packageId, clockId: self.cfg.clockId },
          self.signer,
          self.client
        ),
      ack: (msgId: string, ackPayloadBlob: string) =>
        a2aModule.acknowledgeMessage(
          self.packageId,
          msgId,
          ackPayloadBlob,
          self.signer,
          self.client
        ),
      inbox: (address: string) =>
        a2aModule.getInbox(self.client, address, self.packageId),
      pendingAcks: (agentId: string) =>
        a2aModule.getPendingAcks(self.client, self.packageId, agentId),
    };
  }

  // ─── Module 8: memory ─────────────────────────────────────────────────

  get memory() {
    const self = this;
    return {
      store: (params: Omit<memoryModule.StoreMemoryParams, "packageId" | "clockId">) =>
        memoryModule.storeMemory(
          { ...params, packageId: self.packageId, clockId: self.cfg.clockId },
          self.signer,
          self.client
        ),
      get: (anchorId: string) => memoryModule.getMemory(self.client, anchorId),
      list: (agentId: string, type?: import("./types.js").MemoryType) =>
        memoryModule.listAgentMemory(self.client, self.packageId, agentId, type),
      verifyIntegrity: (anchorId: string, hash: Uint8Array) =>
        memoryModule.verifyMemoryIntegrity(self.client, anchorId, hash),
      uploadToWalrus: memoryModule.uploadToWalrus,
    };
  }
}
