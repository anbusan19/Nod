import type { AddressLookupTableAccount, VersionedTransaction } from "@solana/web3.js";
import { PROGRAMS } from "./programs";

/** Lighthouse: assertion instructions that Phantom appends to protect users on mainnet. */
const LIGHTHOUSE = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";

/** Programs a wallet may add around the instructions the user reviewed. */
const WALLET_ADDED = new Set<string>([PROGRAMS.computeBudget, LIGHTHOUSE]);

/** Refuse to submit if the wallet attached a priority fee above this (0.005 SOL). */
export const MAX_PRIORITY_FEE_LAMPORTS = 5_000_000n;

export type VerifyResult = { ok: true; notes: string[] } | { ok: false; reason: string };

interface Flat {
  programId: string;
  accounts: string[];
  data: string;
}

function flatten(tx: VersionedTransaction, tables: AddressLookupTableAccount[]): Flat[] {
  const msg = tx.message;
  const keys = msg.getAccountKeys({ addressLookupTableAccounts: tables });
  return msg.compiledInstructions.map((ix) => {
    const programId = keys.get(ix.programIdIndex);
    if (!programId) throw new Error("unresolved program account");
    return {
      programId: programId.toBase58(),
      accounts: ix.accountKeyIndexes.map((i) => {
        const k = keys.get(i);
        if (!k) throw new Error("unresolved account");
        return k.toBase58();
      }),
      data: Buffer.from(ix.data).toString("hex"),
    };
  });
}

/** Priority fee in lamports implied by the ComputeBudget instructions in `ixs`. */
function priorityFee(ixs: Flat[]): bigint {
  let limit = 200_000n;
  let price = 0n;
  for (const ix of ixs) {
    if (ix.programId !== PROGRAMS.computeBudget) continue;
    const d = Buffer.from(ix.data, "hex");
    if (d[0] === 2 && d.length >= 5) limit = BigInt(d.readUInt32LE(1));
    if (d[0] === 3 && d.length >= 9) price = d.readBigUInt64LE(1);
  }
  return (limit * price) / 1_000_000n;
}

/**
 * Checks that the transaction the wallet signed is the one the user reviewed. The wallet may
 * add compute-budget or Lighthouse instructions; everything else must match exactly, in order.
 */
export function verifySigned(
  original: VersionedTransaction,
  signed: VersionedTransaction,
  tables: AddressLookupTableAccount[] = [],
  opts: { allowBlockhashChange?: boolean } = {},
): VerifyResult {
  try {
    const o = original.message;
    const s = signed.message;
    if (o.staticAccountKeys[0].toBase58() !== s.staticAccountKeys[0].toBase58()) {
      return { ok: false, reason: "The wallet changed the fee payer." };
    }
    if (!opts.allowBlockhashChange && o.recentBlockhash !== s.recentBlockhash) {
      return { ok: false, reason: "The wallet changed the blockhash." };
    }

    const orig = flatten(original, tables);
    const sign = flatten(signed, tables);
    const isCore = (ix: Flat) => !WALLET_ADDED.has(ix.programId);
    const origCore = orig.filter(isCore);
    const signCore = sign.filter(isCore);

    if (signCore.length !== origCore.length || signCore.some((ix, i) => !sameIx(ix, origCore[i]))) {
      return { ok: false, reason: "The wallet changed the instructions you approved." };
    }
    const added = sign.length - signCore.length - (orig.length - origCore.length);

    const fee = priorityFee(sign);
    if (fee > MAX_PRIORITY_FEE_LAMPORTS) {
      return { ok: false, reason: `The wallet added a priority fee of ${fee} lamports, which is too high.` };
    }
    const notes = added > 0 ? [`Wallet added ${added} fee/safety instruction(s).`] : [];
    return { ok: true, notes };
  } catch (e) {
    return { ok: false, reason: `Could not verify the signed transaction: ${(e as Error).message}` };
  }
}

const sameIx = (a: Flat, b: Flat) =>
  a.programId === b.programId && a.data === b.data && a.accounts.length === b.accounts.length && a.accounts.every((x, i) => x === b.accounts[i]);
