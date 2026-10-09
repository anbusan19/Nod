export type Cluster = "devnet" | "mainnet-beta";

export type ProposalStatus =
  | "awaiting_human"
  | "auto_approved"
  | "approved"
  | "rejected"
  | "expired"
  | "blocked"
  | "submitted"
  | "confirmed"
  | "failed";

/** What the agent says a transaction does. The phone checks this against the real bytes. */
export interface Intent {
  /** Total SOL the transaction sends. */
  sol?: number;
  /** The single address that should receive it. */
  recipient?: string;
  /** For token swaps. Amounts are raw token units, as strings. */
  swap?: {
    inputMint: string;
    outputMint: string;
    /** What you pay (exact-in swaps). */
    inAmount?: string;
    /** The least you accept to receive. The transaction must not allow less. */
    minOut?: string;
  };
}

export interface Proposal {
  id: string;
  agentId: string;
  /** The transaction as base64. */
  transaction: string;
  txHash: string;
  reason: string;
  tier: "auto" | "nod" | "council" | "block";
  status: ProposalStatus;
  /** Set when the backend blocked the proposal. */
  blockReason: string | null;
  intent: Intent | null;
  cluster: Cluster;
  /** The on-chain signature, once confirmed. */
  signature: string | null;
  error: string | null;
  createdAt: number;
  expiresAt: number;
  /** Present on a create call: the policy's reason for the tier it chose. */
  policyNote?: string;
}

export interface Policy {
  autoLimitLamports: number;
  hardCapLamports: number;
  dailyCapLamports: number;
  allowedRecipients: string[];
  allowedPrograms: string[];
  allowUnknownPrograms: boolean;
}

export interface AgentInfo {
  agentId: string;
  name: string;
  /** A frozen agent has every proposal blocked until the user unfreezes it. */
  frozen: boolean;
  policy: Policy;
}

/** A transaction, as base64 or as bytes, or any object with `serialize()` (web3.js transactions). */
export type TransactionInput = string | Uint8Array | { serialize(config?: unknown): Uint8Array };

export interface ProposeInput {
  transaction: TransactionInput;
  /** Shown to the user as "agent says". Never treated as verified. */
  reason?: string;
  intent?: Intent;
  cluster?: Cluster;
  /**
   * Makes retries safe: the same key returns the original proposal instead of creating a duplicate.
   * The SDK generates one for you when you leave this out.
   */
  idempotencyKey?: string;
}

export interface WaitOptions {
  /** Time between checks. Default 1500 ms. */
  intervalMs?: number;
  /** Give up after this long. Default 5 minutes. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called whenever the status changes. */
  onUpdate?: (proposal: Proposal) => void;
}
