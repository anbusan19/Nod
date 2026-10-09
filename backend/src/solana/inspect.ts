import { createHash } from "node:crypto";
import { VersionedTransaction } from "@solana/web3.js";
import { PROGRAMS } from "./programs.js";

export interface TxSummary {
  hash: string;
  programs: string[];
  /** Total lamports moved by System transfers (coarse, for policy only). */
  lamports: number;
  recipients: string[];
  usesLookupTables: boolean;
  /** True if a Token `SetAuthority` or `Approve` style instruction is present. */
  grantsAuthority: boolean;
  isSwap: boolean;
  /** True only if every instruction is a SOL transfer, compute budget or memo. */
  plainTransfersOnly: boolean;
  recentBlockhash: string;
}

const SYSTEM_ASSIGN = 1;
const SYSTEM_TRANSFER = 2;
const SYSTEM_ASSIGN_WITH_SEED = 10;
const TOKEN_APPROVE = 4;
const TOKEN_SET_AUTHORITY = 6;
const TOKEN_APPROVE_CHECKED = 13;

/**
 * Coarse backend-side inspection used only for routing and policy. The phone
 * does its own full decode and simulation before anything is signed.
 */
export function inspectTransaction(txBase64: string): TxSummary {
  const bytes = Buffer.from(txBase64, "base64");
  const tx = VersionedTransaction.deserialize(bytes);
  const msg = tx.message;
  const keys = msg.staticAccountKeys;

  const programs = new Set<string>();
  const recipients: string[] = [];
  let lamports = 0;
  let grantsAuthority = false;
  let plainTransfersOnly = true;

  for (const ix of msg.compiledInstructions) {
    const programId = keys[ix.programIdIndex]?.toBase58();
    if (!programId) continue;
    programs.add(programId);
    const data = Buffer.from(ix.data);

    const sysType = programId === PROGRAMS.system && data.length >= 4 ? data.readUInt32LE(0) : -1;
    if (sysType === SYSTEM_TRANSFER && data.length >= 12) {
      lamports += Number(data.readBigUInt64LE(4));
      const to = keys[ix.accountKeyIndexes[1]]?.toBase58();
      if (to) recipients.push(to);
    } else if (sysType === SYSTEM_ASSIGN || sysType === SYSTEM_ASSIGN_WITH_SEED) {
      // Reassigning an account to another program can lock the owner out of it.
      grantsAuthority = true;
      plainTransfersOnly = false;
    } else if (programId !== PROGRAMS.computeBudget && programId !== PROGRAMS.memo) {
      plainTransfersOnly = false;
    }
    if (programId === PROGRAMS.token && data.length >= 1) {
      const tag = data[0];
      if (tag === TOKEN_APPROVE || tag === TOKEN_SET_AUTHORITY || tag === TOKEN_APPROVE_CHECKED) {
        grantsAuthority = true;
      }
    }
  }

  return {
    hash: createHash("sha256").update(bytes).digest("hex"),
    programs: [...programs],
    lamports,
    recipients,
    usesLookupTables: msg.addressTableLookups.length > 0,
    grantsAuthority,
    isSwap: programs.has(PROGRAMS.jupiter),
    plainTransfersOnly,
    recentBlockhash: msg.recentBlockhash,
  };
}
