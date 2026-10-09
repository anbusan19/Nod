import {
  AddressLookupTableAccount,
  PublicKey,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { parseJupiterInstruction, type JupiterSwap } from "./jupiter";
import { PROGRAMS } from "./programs";

export type DecodedInstruction =
  | { kind: "sol-transfer"; from: string; to: string; lamports: bigint }
  | { kind: "create-account"; from: string; newAccount: string; lamports: bigint; owner: string }
  | { kind: "assign"; account: string; owner: string }
  | { kind: "spl-transfer"; source: string; destination: string; authority: string; amount: bigint; mint?: string; decimals?: number }
  | { kind: "spl-approve"; source: string; delegate: string; owner: string; amount: bigint }
  | { kind: "spl-set-authority"; account: string; authorityType: string; newAuthority: string | null }
  | { kind: "spl-close"; account: string; destination: string }
  | { kind: "create-ata"; payer: string; ata: string; wallet: string; mint: string }
  | { kind: "compute-budget"; detail: string }
  | { kind: "memo"; text: string }
  | { kind: "swap"; program: string; accounts: number; swap?: JupiterSwap; unreadable?: string }
  | { kind: "spl-sync-native"; account: string }
  | { kind: "unknown"; programId: string; accounts: number; dataLength: number };

export interface DecodedTransaction {
  feePayer: string;
  /** Accounts that must sign. */
  signers: string[];
  recentBlockhash: string;
  instructions: DecodedInstruction[];
  programs: string[];
  /** Token accounts (source/destination) referenced by SPL instructions. */
  tokenAccounts: string[];
}

export type RiskCode =
  | "unknown-program"
  | "delegate-approval"
  | "authority-change"
  | "new-recipient"
  | "unusual-amount"
  | "account-assign"
  | "swap-unreadable"
  | "swap-wrong-authority"
  | "swap-output-elsewhere"
  | "high-slippage";

export interface Risk {
  code: RiskCode;
  label: string;
  severity: "warn" | "danger";
}

export function deserialize(txBase64: string): VersionedTransaction {
  return VersionedTransaction.deserialize(Buffer.from(txBase64, "base64"));
}

/** Lookup-table addresses referenced by the message, to be fetched before decoding. */
export function lookupTableKeys(tx: VersionedTransaction): PublicKey[] {
  return tx.message.addressTableLookups.map((l) => l.accountKey);
}

const AUTHORITY_TYPES = ["MintTokens", "FreezeAccount", "AccountOwner", "CloseAccount"];

function decodeInstruction(ix: TransactionInstruction): DecodedInstruction {
  const programId = ix.programId.toBase58();
  const data = Buffer.from(ix.data);
  const k = (i: number) => ix.keys[i]?.pubkey.toBase58() ?? "";

  switch (programId) {
    case PROGRAMS.system: {
      const type = data.length >= 4 ? data.readUInt32LE(0) : -1;
      if (type === 2 && data.length >= 12) {
        return { kind: "sol-transfer", from: k(0), to: k(1), lamports: data.readBigUInt64LE(4) };
      }
      if (type === 0 && data.length >= 52) {
        return {
          kind: "create-account",
          from: k(0),
          newAccount: k(1),
          lamports: data.readBigUInt64LE(4),
          owner: new PublicKey(data.subarray(20, 52)).toBase58(),
        };
      }
      if (type === 1 && data.length >= 36) {
        return { kind: "assign", account: k(0), owner: new PublicKey(data.subarray(4, 36)).toBase58() };
      }
      break;
    }
    case PROGRAMS.token: {
      const tag = data[0];
      if (tag === 3 && data.length >= 9) {
        return { kind: "spl-transfer", source: k(0), destination: k(1), authority: k(2), amount: data.readBigUInt64LE(1) };
      }
      if (tag === 12 && data.length >= 10) {
        // TransferChecked: source, mint, destination, authority
        return {
          kind: "spl-transfer",
          source: k(0),
          mint: k(1),
          destination: k(2),
          authority: k(3),
          amount: data.readBigUInt64LE(1),
          decimals: data[9],
        };
      }
      if (tag === 4 && data.length >= 9) {
        return { kind: "spl-approve", source: k(0), delegate: k(1), owner: k(2), amount: data.readBigUInt64LE(1) };
      }
      if (tag === 13 && data.length >= 10) {
        return { kind: "spl-approve", source: k(0), delegate: k(2), owner: k(3), amount: data.readBigUInt64LE(1) };
      }
      if (tag === 6 && data.length >= 3) {
        const hasNew = data[2] === 1 && data.length >= 35;
        return {
          kind: "spl-set-authority",
          account: k(0),
          authorityType: AUTHORITY_TYPES[data[1]] ?? `Type${data[1]}`,
          newAuthority: hasNew ? new PublicKey(data.subarray(3, 35)).toBase58() : null,
        };
      }
      if (tag === 9) return { kind: "spl-close", account: k(0), destination: k(1) };
      if (tag === 17) return { kind: "spl-sync-native", account: k(0) };
      break;
    }
    case PROGRAMS.ata:
      // Create (empty data or 0) and CreateIdempotent (1) share the same account layout.
      if (data.length === 0 || data[0] === 0 || data[0] === 1) {
        return { kind: "create-ata", payer: k(0), ata: k(1), wallet: k(2), mint: k(3) };
      }
      break;
    case PROGRAMS.computeBudget: {
      if (data[0] === 2 && data.length >= 5) return { kind: "compute-budget", detail: `Compute limit ${data.readUInt32LE(1)}` };
      if (data[0] === 3 && data.length >= 9) {
        return { kind: "compute-budget", detail: `Priority fee ${data.readBigUInt64LE(1)} µ-lamports/CU` };
      }
      return { kind: "compute-budget", detail: "Compute budget setting" };
    }
    case PROGRAMS.memo:
      return { kind: "memo", text: data.toString("utf8") };
    case PROGRAMS.jupiter: {
      const parsed = parseJupiterInstruction(data, ix.keys.map((x) => x.pubkey.toBase58()));
      return parsed.ok
        ? { kind: "swap", program: "Jupiter v6", accounts: ix.keys.length, swap: parsed.swap }
        : { kind: "swap", program: "Jupiter v6", accounts: ix.keys.length, unreadable: parsed.reason };
    }
  }
  return { kind: "unknown", programId, accounts: ix.keys.length, dataLength: data.length };
}

export function decodeTransaction(tx: VersionedTransaction, lookupTables: AddressLookupTableAccount[] = []): DecodedTransaction {
  const msg = tx.message;
  const keys = msg.getAccountKeys({ addressLookupTableAccounts: lookupTables });

  const instructions: DecodedInstruction[] = [];
  const programs = new Set<string>();
  const tokenAccounts = new Set<string>();

  for (const c of msg.compiledInstructions) {
    const programId = keys.get(c.programIdIndex);
    if (!programId) throw new Error("Instruction references an unresolved program account");
    const ix: TransactionInstruction = {
      programId,
      data: Buffer.from(c.data),
      keys: c.accountKeyIndexes.map((i) => {
        const pubkey = keys.get(i);
        if (!pubkey) throw new Error("Instruction references an unresolved account (missing lookup table?)");
        return { pubkey, isSigner: msg.isAccountSigner(i), isWritable: msg.isAccountWritable(i) };
      }),
    } as TransactionInstruction;
    programs.add(programId.toBase58());
    const d = decodeInstruction(ix);
    if (d.kind === "spl-transfer") {
      tokenAccounts.add(d.source);
      tokenAccounts.add(d.destination);
    }
    instructions.push(d);
  }

  const numSigners = msg.header.numRequiredSignatures;
  const signers = msg.staticAccountKeys.slice(0, numSigners).map((p) => p.toBase58());
  return {
    feePayer: msg.staticAccountKeys[0].toBase58(),
    signers,
    recentBlockhash: msg.recentBlockhash,
    instructions,
    programs: [...programs],
    tokenAccounts: [...tokenAccounts],
  };
}

export interface RiskContext {
  /** The user's wallet address. */
  owner: string;
  knownRecipients: Set<string>;
  /** Largest SOL transfer (lamports) considered normal for this agent. */
  usualMaxLamports?: bigint;
  /** Instruction indexes already explained elsewhere (such as swap plumbing); not risk-assessed. */
  ignore?: Set<number>;
}

export function assessRisks(decoded: DecodedTransaction, ctx: RiskContext): Risk[] {
  const risks = new Map<RiskCode, Risk>();
  const add = (r: Risk) => risks.set(r.code, r);

  for (const [n, ix] of decoded.instructions.entries()) {
    if (ctx.ignore?.has(n)) continue;
    switch (ix.kind) {
      case "unknown":
        add({ code: "unknown-program", label: "Cannot decode, review carefully", severity: "danger" });
        break;
      case "spl-approve":
        add({ code: "delegate-approval", label: "Grants spending authority over a token account", severity: "danger" });
        break;
      case "spl-set-authority":
        add({ code: "authority-change", label: "Changes who controls an account", severity: "danger" });
        break;
      case "assign":
        add({ code: "account-assign", label: "Reassigns an account to another program", severity: "danger" });
        break;
      case "sol-transfer":
        if (!ctx.knownRecipients.has(ix.to)) add({ code: "new-recipient", label: "New recipient", severity: "warn" });
        if (ctx.usualMaxLamports !== undefined && ix.lamports > ctx.usualMaxLamports) {
          add({ code: "unusual-amount", label: "Larger than this agent usually sends", severity: "warn" });
        }
        break;
      case "spl-transfer":
        if (!ctx.knownRecipients.has(ix.destination)) add({ code: "new-recipient", label: "New recipient", severity: "warn" });
        break;
    }
  }
  return [...risks.values()];
}

const LAMPORTS_PER_SOL = 1_000_000_000n;

export function formatSol(lamports: bigint): string {
  const neg = lamports < 0n;
  const abs = neg ? -lamports : lamports;
  const whole = abs / LAMPORTS_PER_SOL;
  const frac = (abs % LAMPORTS_PER_SOL).toString().padStart(9, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""} SOL`;
}

export function formatTokenAmount(raw: bigint, decimals?: number): string {
  if (decimals === undefined) return raw.toString();
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}${frac ? "." + frac : ""}`;
}

export function shorten(addr: string, edge = 4): string {
  return addr.length <= edge * 2 + 1 ? addr : `${addr.slice(0, edge)}…${addr.slice(-edge)}`;
}
