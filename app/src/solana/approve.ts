import { PublicKey, type AddressLookupTableAccount, type VersionedTransaction } from "@solana/web3.js";
import { config, type Cluster } from "../config";
import { api, type Proposal } from "../api/client";
import { confirmWithBiometrics } from "../security/biometric";
import { connectionFor, fetchLookupTables } from "./connection";
import {
  assessRisks,
  decodeTransaction,
  deserialize,
  lookupTableKeys,
  type DecodedTransaction,
  type Risk,
} from "./decode";
import { sendAndConfirm, signWithWallet } from "./mwa";
import { simulate, type SimulationResult } from "./simulate";
import { summarizeSwap, type SwapSummary } from "./swap";
import { resolveTokens, type TokenInfo } from "./tokens";
import { assertHashMatches } from "./verify";
import { classifyWalletError } from "./walletErrors";
import { verifySigned } from "./verifySigned";

const label = (c: Cluster) => (c === "mainnet-beta" ? "mainnet" : c);

export interface Prepared {
  proposal: Proposal;
  cluster: Cluster;
  tx: VersionedTransaction;
  tables: AddressLookupTableAccount[];
  decoded: DecodedTransaction;
  simulation: SimulationResult;
  /** Present when the transaction contains a Jupiter swap. */
  swap?: SwapSummary;
  tokens: Record<string, TokenInfo>;
  risks: Risk[];
  /** Reasons the app refuses to let the user sign at all. */
  blockers: string[];
  /** Context worth showing that is not a reason to refuse. */
  notes: string[];
}

/**
 * Everything the phone verifies on its own before showing an approval card.
 * Nothing here trusts the backend or the agent beyond the raw transaction bytes.
 */
export async function prepare(proposal: Proposal, owner: string, knownRecipients: Set<string>): Promise<Prepared> {
  assertHashMatches(proposal.transaction, proposal.txHash);
  const cluster: Cluster = proposal.cluster ?? config.cluster;
  const tx = deserialize(proposal.transaction);
  const tables = await fetchLookupTables(lookupTableKeys(tx), cluster);
  const decoded = decodeTransaction(tx, tables);

  const blockers: string[] = [];
  const notes: string[] = [];
  const previewOnly = cluster !== config.cluster;
  if (cluster !== config.cluster) {
    blockers.push(`This is a ${label(cluster)} transaction, but Nod is set to ${label(config.cluster)}. You can review it, but not sign it.`);
  }
  if (!decoded.signers.includes(owner)) blockers.push("This transaction is not signed by your connected wallet.");
  if (decoded.signers.length > 1) blockers.push("This transaction needs signatures from other accounts.");

  const swap = summarizeSwap(decoded, owner);
  const swapAccounts = swap?.swap ? [swap.swap.sourceAccount, swap.swap.destinationAccount] : [];
  const mints = swap?.swap ? [swap.swap.sourceMint, swap.swap.destinationMint] : [];

  const [simulation, tokens] = await Promise.all([
    simulate(tx, new PublicKey(owner), [...decoded.tokenAccounts, ...swapAccounts], cluster),
    resolveTokens(connectionFor(cluster), mints),
  ]);
  if (!simulation.ok) {
    if (previewOnly) {
      // Signing is already blocked for the cluster mismatch. A failed simulation here usually just means
      // this wallet has no funds or account on that cluster, so explain it instead of adding a second blocker.
      notes.push(`Balance changes can't be simulated on ${label(cluster)}: this wallet has no usable account or funds there. The decoded details above still come from the transaction itself.`);
    } else {
      blockers.push(`Simulation failed: ${simulation.error}`);
    }
  }

  const risks = assessRisks(decoded, { owner, knownRecipients, ignore: swap?.hidden });
  for (const r of swap?.risks ?? []) if (!risks.some((x) => x.code === r.code)) risks.push(r);

  if (risks.some((r) => r.code === "unknown-program")) blockers.push("Contains a program Nod cannot decode.");
  if (swap?.unreadable) blockers.push("Contains a swap Nod cannot read, so it cannot show you what it does.");
  return { proposal, cluster, tx, tables, decoded, simulation, swap, tokens, risks, blockers, notes };
}

/**
 * `retryable` means the user simply backed out (closed the wallet, declined, cancelled the fingerprint/face
 * prompt). Nothing was sent, the proposal is untouched and still waiting, so the card stays open for another try.
 */
export type ApproveOutcome = { ok: true; signature: string } | { ok: false; reason: string; retryable?: boolean };

export async function approve(p: Prepared, owner: string): Promise<ApproveOutcome> {
  if (p.blockers.length > 0) return { ok: false, reason: p.blockers[0] };

  const bio = await confirmWithBiometrics("Approve this transaction");
  if (!bio.ok) return { ok: false, reason: bio.reason, retryable: true };

  let txHash = p.proposal.txHash;
  try {
    // A blockhash lives ~36s on devnet, so take a fresh one now that the user has authenticated.
    // The instructions must be exactly what was reviewed; only the blockhash may differ.
    const fresh = await api.refresh(p.proposal.id);
    assertHashMatches(fresh.transaction, fresh.txHash);
    const tx = deserialize(fresh.transaction);
    const same = verifySigned(p.tx, tx, p.tables, { allowBlockhashChange: true });
    if (!same.ok) throw new Error(`Refreshed transaction differs from the one you reviewed. ${same.reason}`);
    txHash = fresh.txHash;

    const signed = await signWithWallet(tx, owner);
    // The wallet may add fee instructions, but must not change what the user reviewed.
    const check = verifySigned(tx, signed, p.tables);
    if (!check.ok) throw new Error(check.reason);
    await api.result(p.proposal.id, { status: "approved", txHash }).catch(() => {});
    const signature = await sendAndConfirm(signed, tx.message.recentBlockhash, p.cluster);
    // The transaction has landed; a failure to tell the backend must not read as a failed payment.
    await api.result(p.proposal.id, { status: "confirmed", txHash, signature }).catch(() => {});
    return { ok: true, signature };
  } catch (e) {
    const info = classifyWalletError(e);
    // Backing out of the wallet is the user's choice, not a failed payment: leave the proposal waiting.
    if (info.retryable) return { ok: false, reason: info.message, retryable: true };
    await api.result(p.proposal.id, { status: "failed", txHash, error: info.message }).catch(() => {});
    return { ok: false, reason: info.message };
  }
}
