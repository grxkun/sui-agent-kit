/**
 * @module networks
 * Network configuration manager — no more hardcoded package IDs.
 */

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";

// ── Types ────────────────────────────────────────────────────────────────────

export type NetworkName = "mainnet" | "testnet" | "devnet" | "localnet";

export interface NetworkConfig {
  /** Network identifier */
  name: NetworkName;
  /** Full node RPC URL */
  rpcUrl: string;
  /** WebSocket URL (for event subscriptions) */
  wsUrl?: string;
  /** Deployed package IDs for this network */
  packages: PackageAddresses;
  /** Shared object IDs (registries, boards, etc.) */
  objects?: SharedObjects;
  /** Block explorer base URL */
  explorerUrl?: string;
}

export interface PackageAddresses {
  agentIdentity?: string;
  delegation?: string;
  taskMarket?: string;
  reputation?: string;
  x402Pay?: string;
  messaging?: string;
  walrusMemory?: string;
  /** Catch-all for custom/additional packages */
  [key: string]: string | undefined;
}

export interface SharedObjects {
  agentRegistry?: string;
  taskBoard?: string;
  reputationBoard?: string;
  [key: string]: string | undefined;
}

// ── Default Configs ──────────────────────────────────────────────────────────

const DEFAULT_CONFIGS: Record<NetworkName, Omit<NetworkConfig, "packages">> = {
  mainnet: {
    name: "mainnet",
    rpcUrl: getFullnodeUrl("mainnet"),
    wsUrl: "wss://fullnode.mainnet.sui.io",
    explorerUrl: "https://suiscan.xyz/mainnet",
  },
  testnet: {
    name: "testnet",
    rpcUrl: getFullnodeUrl("testnet"),
    wsUrl: "wss://fullnode.testnet.sui.io",
    explorerUrl: "https://suiscan.xyz/testnet",
  },
  devnet: {
    name: "devnet",
    rpcUrl: getFullnodeUrl("devnet"),
    wsUrl: "wss://fullnode.devnet.sui.io",
    explorerUrl: "https://suiscan.xyz/devnet",
  },
  localnet: {
    name: "localnet",
    rpcUrl: "http://127.0.0.1:9000",
    wsUrl: "ws://127.0.0.1:9000",
    explorerUrl: undefined,
  },
};

// ── Network Registry ─────────────────────────────────────────────────────────

const registry = new Map<string, NetworkConfig>();

/**
 * Register package addresses for a network.
 *
 * @example
 * ```ts
 * registerNetwork("testnet", {
 *   agentIdentity: "0xabc...",
 *   taskMarket: "0xdef...",
 * });
 * ```
 */
export function registerNetwork(
  name: NetworkName | string,
  packages: PackageAddresses,
  overrides?: Partial<NetworkConfig>
): void {
  const base = DEFAULT_CONFIGS[name as NetworkName] ?? {
    name,
    rpcUrl: overrides?.rpcUrl ?? "",
  };

  registry.set(name, {
    ...base,
    ...overrides,
    name: name as NetworkName,
    packages,
  });
}

/**
 * Get a registered network config.
 */
export function getNetwork(name: string): NetworkConfig {
  const config = registry.get(name);
  if (!config) {
    throw new Error(
      `Network "${name}" not registered. Call registerNetwork("${name}", { ... }) first.`
    );
  }
  return config;
}

/**
 * List all registered network names.
 */
export function listNetworks(): string[] {
  return [...registry.keys()];
}

/**
 * Create a SuiClient from a registered network config.
 *
 * @example
 * ```ts
 * registerNetwork("testnet", { agentIdentity: "0x..." });
 * const client = createClient("testnet");
 * ```
 */
export function createClient(name: string): SuiClient {
  const config = getNetwork(name);
  return new SuiClient({ url: config.rpcUrl });
}

/**
 * Get the package ID for a specific module on a network.
 *
 * @example
 * ```ts
 * const pkgId = getPackageId("testnet", "taskMarket");
 * // "0xdef..."
 * ```
 */
export function getPackageId(network: string, module: keyof PackageAddresses): string {
  const config = getNetwork(network);
  const id = config.packages[module];
  if (!id) {
    throw new Error(
      `Package "${String(module)}" not registered for network "${network}".`
    );
  }
  return id;
}

/**
 * Get explorer link for a transaction digest.
 */
export function explorerTxUrl(network: string, digest: string): string | null {
  const config = getNetwork(network);
  if (!config.explorerUrl) return null;
  return `${config.explorerUrl}/tx/${digest}`;
}

/**
 * Get explorer link for an object.
 */
export function explorerObjectUrl(network: string, objectId: string): string | null {
  const config = getNetwork(network);
  if (!config.explorerUrl) return null;
  return `${config.explorerUrl}/object/${objectId}`;
}
