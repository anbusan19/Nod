import { KNOWN_PROGRAMS } from "../solana/programs.js";
import type { TxSummary } from "../solana/inspect.js";

export type Tier = "auto" | "nod" | "council" | "block";

export interface Policy {
  autoLimitLamports: number;
  hardCapLamports: number;
  dailyCapLamports: number;
  allowedRecipients: string[];
  allowedPrograms: string[];
  allowUnknownPrograms: boolean;
}

export interface PolicyContext {
  frozen: boolean;
  spentTodayLamports: number;
}

export interface Decision {
  tier: Tier;
  reason: string;
}

export function evaluate(tx: TxSummary, policy: Policy, ctx: PolicyContext): Decision {
  if (ctx.frozen) return { tier: "block", reason: "Agent is frozen" };

  const allowedPrograms = new Set([...KNOWN_PROGRAMS, ...policy.allowedPrograms]);
  const unknown = tx.programs.filter((p) => !allowedPrograms.has(p));
  if (unknown.length > 0 && !policy.allowUnknownPrograms) {
    return { tier: "block", reason: `Unknown program: ${unknown[0]}` };
  }
  if (tx.grantsAuthority) {
    return { tier: "block", reason: "Transaction grants spending authority or changes an authority" };
  }
  if (tx.lamports > policy.hardCapLamports) {
    return { tier: "block", reason: "Amount exceeds hard cap" };
  }
  if (ctx.spentTodayLamports + tx.lamports > policy.dailyCapLamports) {
    return { tier: "block", reason: "Daily spend cap reached" };
  }

  if (unknown.length > 0) return { tier: "nod", reason: "Contains a program Nod cannot decode" };
  if (tx.isSwap) return { tier: "nod", reason: "Swaps always need approval" };
  if (tx.usesLookupTables) return { tier: "nod", reason: "Uses address lookup tables" };
  if (!tx.plainTransfersOnly) return { tier: "nod", reason: "Contains more than plain SOL transfers" };

  const allow = new Set(policy.allowedRecipients);
  const newRecipient = tx.recipients.some((r) => !allow.has(r));
  if (newRecipient) return { tier: "nod", reason: "Recipient is not on the allowlist" };
  if (tx.lamports > policy.autoLimitLamports) return { tier: "nod", reason: "Over the auto-approve limit" };

  return { tier: "auto", reason: "Within auto-approve limits" };
}
