import { PublicKey } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { DecodedTransaction, Risk } from "./decode";
import type { JupiterSwap } from "./jupiter";
import { WSOL_MINT } from "./tokens";

export interface SwapSummary {
  /** Index of the Jupiter instruction in the transaction. */
  index: number;
  /** Present when the swap was read successfully. */
  swap?: JupiterSwap & { sourceMint: string };
  /** Why the swap could not be read. */
  unreadable?: string;
  /** Instruction indexes that are plain plumbing for this swap, to hide from the card. */
  hidden: Set<number>;
  risks: Risk[];
}

const SLIPPAGE_WARN_BPS = 100; // 1%
const SLIPPAGE_DANGER_BPS = 500; // 5%

/** The owner's standard token account for a mint, under either token program. */
function standardAccounts(owner: PublicKey, mint: PublicKey): string[] {
  return [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((p) => getAssociatedTokenAddressSync(mint, owner, false, p, ASSOCIATED_TOKEN_PROGRAM_ID).toBase58());
}

const isOwnStandardAccount = (account: string, owner: PublicKey, mint: string) => standardAccounts(owner, new PublicKey(mint)).includes(account);

/**
 * Reads a Jupiter swap out of a decoded transaction and checks it. Wrap/unwrap and account-setup
 * instructions are hidden only when they involve the owner's own standard accounts for this swap,
 * so nothing that moves value elsewhere can hide behind the swap.
 */
export function summarizeSwap(decoded: DecodedTransaction, ownerAddress: string): SwapSummary | undefined {
  const swapIndexes = decoded.instructions.flatMap((ix, i) => (ix.kind === "swap" ? [i] : []));
  if (swapIndexes.length === 0) return undefined;

  const index = swapIndexes[0];
  const ix = decoded.instructions[index];
  if (ix.kind !== "swap") return undefined;

  const risks: Risk[] = [];
  const hidden = new Set<number>();
  const danger = (code: Risk["code"], label: string) => risks.push({ code, label, severity: "danger" });

  if (swapIndexes.length > 1) danger("swap-unreadable", "Contains several swaps; review the simulated balance changes");

  if (!ix.swap) {
    danger("swap-unreadable", `Cannot read the swap amounts: ${ix.unreadable ?? "unknown format"}`);
    return { index, unreadable: ix.unreadable ?? "unknown format", hidden, risks };
  }

  const owner = new PublicKey(ownerAddress);
  const s = ix.swap;

  // The swap's source mint is not in every instruction variant; recover it from account setup.
  let sourceMint = s.sourceMint;
  if (!sourceMint) {
    const created = decoded.instructions.find((i) => i.kind === "create-ata" && i.ata === s.sourceAccount);
    if (created && created.kind === "create-ata") sourceMint = created.mint;
  }
  if (!sourceMint) {
    danger("swap-unreadable", "Cannot tell which token is being sold");
    return { index, unreadable: "source token unknown", hidden, risks };
  }
  const swap = { ...s, sourceMint };

  if (s.userAuthority !== ownerAddress) danger("swap-wrong-authority", "The swap is not authorised by your wallet");

  // Output must land in the owner's own account, or the swap can pay someone else.
  if (!isOwnStandardAccount(s.destinationAccount, owner, s.destinationMint)) {
    danger("swap-output-elsewhere", "The swap pays out to an account that is not yours");
  }

  if (s.slippageBps >= SLIPPAGE_DANGER_BPS) {
    danger("high-slippage", `Slippage tolerance is ${(s.slippageBps / 100).toFixed(2)}%, far above normal`);
  } else if (s.slippageBps > SLIPPAGE_WARN_BPS) {
    risks.push({ code: "high-slippage", label: `High slippage tolerance (${(s.slippageBps / 100).toFixed(2)}%)`, severity: "warn" });
  }

  // Hide plumbing, but only for the owner's own standard accounts that this swap uses.
  const ownSource = isOwnStandardAccount(s.sourceAccount, owner, sourceMint);
  decoded.instructions.forEach((i, n) => {
    if (i.kind === "create-ata" && i.wallet === ownerAddress && i.payer === ownerAddress) {
      if (isOwnStandardAccount(i.ata, owner, i.mint) && (i.mint === sourceMint || i.mint === s.destinationMint)) hidden.add(n);
    }
    if (sourceMint === WSOL_MINT && ownSource) {
      if (i.kind === "sol-transfer" && i.from === ownerAddress && i.to === s.sourceAccount) hidden.add(n);
      if (i.kind === "spl-sync-native" && i.account === s.sourceAccount) hidden.add(n);
      if (i.kind === "spl-close" && i.account === s.sourceAccount && i.destination === ownerAddress) hidden.add(n);
    }
  });

  return { index, swap, hidden, risks };
}
