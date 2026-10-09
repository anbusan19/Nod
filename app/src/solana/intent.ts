import { formatSol, shorten, type DecodedTransaction } from "./decode";
import type { JupiterSwap } from "./jupiter";
import { formatToken, type TokenInfo } from "./tokens";

export interface Intent {
  sol?: number;
  recipient?: string;
  swap?: { inputMint: string; outputMint: string; inAmount?: string; minOut?: string };
}

/** What the phone read from the swap instruction, plus token names for readable messages. */
export interface SwapFacts {
  swap: JupiterSwap & { sourceMint: string };
  tokens: Record<string, TokenInfo>;
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
export function checkIntent(decoded: DecodedTransaction, owner: string, intent: Intent | null | undefined, facts?: SwapFacts): IntentCheck {
  if (!intent || (intent.sol === undefined && !intent.recipient && !intent.swap)) return { status: "none" };

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

  if (intent.swap) {
    const claim = intent.swap;
    if (!facts) {
      problems.push("Agent described a swap, but the phone could not read one in the transaction.");
    } else {
      const { swap: s, tokens } = facts;
      const name = (mint: string, raw: bigint) => formatToken(raw, tokens[mint], mint);
      if (claim.inputMint !== s.sourceMint) problems.push(`Agent said it sells ${shorten(claim.inputMint)}, but the transaction sells ${shorten(s.sourceMint)}.`);
      if (claim.outputMint !== s.destinationMint) problems.push(`Agent said it buys ${shorten(claim.outputMint)}, but the transaction buys ${shorten(s.destinationMint)}.`);
      if (claim.inAmount !== undefined && s.mode === "exact-in" && BigInt(claim.inAmount) !== s.inAmount) {
        problems.push(`Agent said it pays ${name(s.sourceMint, BigInt(claim.inAmount))}, but the transaction pays ${name(s.sourceMint, s.inAmount)}.`);
      }
      // The promise that matters most: a swap that accepts less than the agent promised.
      // One raw unit of slack covers Jupiter rounding its own minimum up.
      if (claim.minOut !== undefined && s.outLimit + 1n < BigInt(claim.minOut)) {
        problems.push(`Agent promised at least ${name(s.destinationMint, BigInt(claim.minOut))}, but the transaction accepts as little as ${name(s.destinationMint, s.outLimit)}.`);
      }
    }
  }

  return problems.length > 0 ? { status: "mismatch", problems } : { status: "match" };
}
