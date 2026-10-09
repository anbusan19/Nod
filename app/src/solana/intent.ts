import { formatSol, shorten, type DecodedTransaction } from "./decode";

export interface Intent {
  sol?: number;
  recipient?: string;
}

export type IntentCheck =
  | { status: "none" }
  | { status: "match" }
  | { status: "mismatch"; problems: string[] };

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Compares what the agent said the transaction does with what it actually does. The agent's claim
 * is never used to describe the transaction; it is only checked against the decoded facts.
 */
export function checkIntent(decoded: DecodedTransaction, owner: string, intent: Intent | null | undefined): IntentCheck {
  if (!intent || (intent.sol === undefined && !intent.recipient)) return { status: "none" };

  const sends = decoded.instructions.flatMap((ix) => (ix.kind === "sol-transfer" && ix.from === owner ? [ix] : []));
  const total = sends.reduce((sum, ix) => sum + ix.lamports, 0n);
  const problems: string[] = [];

  if (intent.sol !== undefined) {
    const claimed = BigInt(Math.round(intent.sol * LAMPORTS_PER_SOL));
    const tolerance = claimed / 1000n + 1n; // 0.1% plus one lamport, for rounding
    const diff = total > claimed ? total - claimed : claimed - total;
    if (diff > tolerance) {
      problems.push(`Agent said ${formatSol(claimed)}, but the transaction sends ${formatSol(total)}.`);
    }
  }

  if (intent.recipient) {
    const others = [...new Set(sends.map((ix) => ix.to).filter((to) => to !== intent.recipient))];
    if (others.length > 0) {
      problems.push(`Agent said it pays ${shorten(intent.recipient)}, but the transaction pays ${others.map((a) => shorten(a)).join(", ")}.`);
    } else if (sends.length === 0) {
      problems.push(`Agent said it pays ${shorten(intent.recipient)}, but the transaction sends no SOL.`);
    }
  }

  return problems.length > 0 ? { status: "mismatch", problems } : { status: "match" };
}
