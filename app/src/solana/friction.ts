import type { DecodedTransaction, Risk } from "./decode";
import type { IntentCheck } from "./intent";

const LAMPORTS_PER_SOL = 1_000_000_000n;
/** Never treat amounts below this as "large", even if the agent's auto-approve limit is tiny. */
const LARGE_FLOOR = LAMPORTS_PER_SOL / 20n; // 0.05 SOL
/** "Large" means more than this many times the agent's auto-approve limit. */
const LARGE_MULTIPLE = 3n;

/** SOL leaving the user's wallet through plain transfers in this transaction. */
export function solOutflow(decoded: DecodedTransaction, owner: string): bigint {
  return decoded.instructions.reduce((sum, ix) => (ix.kind === "sol-transfer" && ix.from === owner ? sum + ix.lamports : sum), 0n);
}

export function largeThreshold(autoLimitLamports: number | undefined): bigint {
  const scaled = BigInt(Math.round(autoLimitLamports ?? 0)) * LARGE_MULTIPLE;
  return scaled > LARGE_FLOOR ? scaled : LARGE_FLOOR;
}

/**
 * Reasons this approval should need a deliberate press-and-hold instead of a tap.
 * An empty list means a normal tap is fine.
 */
export function holdReasons(opts: {
  intent: IntentCheck | undefined;
  risks: Risk[];
  outflowLamports: bigint;
  autoLimitLamports: number | undefined;
}): string[] {
  const reasons: string[] = [];
  if (opts.intent?.status === "mismatch") reasons.push("It does not match what the agent said.");
  if (opts.risks.some((r) => r.severity === "danger")) reasons.push("It carries a high-risk warning.");
  if (opts.outflowLamports > largeThreshold(opts.autoLimitLamports)) reasons.push("The amount is large for this agent.");
  return reasons;
}
