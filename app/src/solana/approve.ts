import { PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { api, type Proposal } from "../api/client";
import { confirmWithBiometrics } from "../security/biometric";
import { connection, fetchLookupTables } from "./connection";
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
import { assertHashMatches } from "./verify";

export interface Prepared {
  proposal: Proposal;
  tx: VersionedTransaction;
  decoded: DecodedTransaction;
  simulation: SimulationResult;
  risks: Risk[];
  /** Reasons the app refuses to let the user sign at all. */
  blockers: string[];
}

/**
 * Everything the phone verifies on its own before showing an approval card.
 * Nothing here trusts the backend or the agent beyond the raw transaction bytes.
 */
export async function prepare(proposal: Proposal, owner: string, knownRecipients: Set<string>): Promise<Prepared> {
  assertHashMatches(proposal.transaction, proposal.txHash);
  const tx = deserialize(proposal.transaction);
  const tables = await fetchLookupTables(lookupTableKeys(tx));
  const decoded = decodeTransaction(tx, tables);

  const blockers: string[] = [];
  if (!decoded.signers.includes(owner)) blockers.push("This transaction is not signed by your connected wallet.");
  if (decoded.signers.length > 1) blockers.push("This transaction needs signatures from other accounts.");

  const blockhashOk = (await connection.isBlockhashValid(decoded.recentBlockhash, { commitment: "confirmed" })).value;
  if (!blockhashOk) blockers.push("This transaction has expired. Ask the agent to propose it again.");

  const simulation = await simulate(tx, new PublicKey(owner), decoded.tokenAccounts);
  if (!simulation.ok) blockers.push(`Simulation failed: ${simulation.error}`);

  const risks = assessRisks(decoded, { owner, knownRecipients });
  if (risks.some((r) => r.code === "unknown-program")) {
    blockers.push("Contains a program Nod cannot decode.");
  }
  return { proposal, tx, decoded, simulation, risks, blockers };
}

export type ApproveOutcome = { ok: true; signature: string } | { ok: false; reason: string };

export async function approve(p: Prepared, owner: string): Promise<ApproveOutcome> {
  if (p.blockers.length > 0) return { ok: false, reason: p.blockers[0] };

  const bio = await confirmWithBiometrics("Approve this transaction");
  if (!bio.ok) return { ok: false, reason: bio.reason };

  const txHash = p.proposal.txHash;
  try {
    const signed = await signWithWallet(p.tx, owner);
    await api.result(p.proposal.id, { status: "approved", txHash }).catch(() => {});
    const signature = await sendAndConfirm(signed, p.decoded.recentBlockhash);
    await api.result(p.proposal.id, { status: "confirmed", txHash, signature });
    return { ok: true, signature };
  } catch (e) {
    const message = (e as Error).message;
    await api.result(p.proposal.id, { status: "failed", txHash, error: message }).catch(() => {});
    return { ok: false, reason: message };
  }
}
