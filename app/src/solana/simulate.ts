import { AccountLayout } from "@solana/spl-token";
import { PublicKey, type VersionedTransaction } from "@solana/web3.js";
import { connection } from "./connection";

export interface BalanceDelta {
  /** Account whose balance changes. */
  account: string;
  kind: "sol" | "token";
  mint?: string;
  /** Raw change: lamports for SOL, base units for tokens. */
  delta: bigint;
}

export interface SimulationResult {
  ok: boolean;
  error?: string;
  unitsConsumed?: number;
  deltas: BalanceDelta[];
  logs: string[];
}

/**
 * Simulates the exact transaction bytes and reports balance changes for the
 * user's wallet and any token accounts the user owns that the tx touches.
 */
export async function simulate(
  tx: VersionedTransaction,
  owner: PublicKey,
  tokenAccounts: string[],
): Promise<SimulationResult> {
  const watched = [owner, ...tokenAccounts.map((a) => new PublicKey(a))];
  const before = await connection.getMultipleAccountsInfo(watched, "confirmed");

  const res = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: false,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: watched.map((w) => w.toBase58()) },
  });

  const logs = res.value.logs ?? [];
  if (res.value.err) {
    return { ok: false, error: JSON.stringify(res.value.err), unitsConsumed: res.value.unitsConsumed, deltas: [], logs };
  }

  const deltas: BalanceDelta[] = [];
  const after = res.value.accounts ?? [];

  const solBefore = BigInt(before[0]?.lamports ?? 0);
  const solAfter = BigInt(after[0]?.lamports ?? 0);
  if (solAfter !== solBefore) {
    deltas.push({ account: owner.toBase58(), kind: "sol", delta: solAfter - solBefore });
  }

  for (let i = 1; i < watched.length; i++) {
    const pre = before[i]?.data;
    const postRaw = after[i]?.data?.[0];
    const post = postRaw ? Buffer.from(postRaw, "base64") : undefined;
    const parse = (d?: Uint8Array) => (d && d.length >= AccountLayout.span ? AccountLayout.decode(d.subarray(0, AccountLayout.span)) : undefined);
    const a = parse(pre);
    const b = parse(post);
    const state = b ?? a;
    // Only report token accounts that the user owns.
    if (!state || !new PublicKey(state.owner).equals(owner)) continue;
    const delta = (b?.amount ?? 0n) - (a?.amount ?? 0n);
    if (delta !== 0n) {
      deltas.push({ account: watched[i].toBase58(), kind: "token", mint: new PublicKey(state.mint).toBase58(), delta });
    }
  }

  return { ok: true, unitsConsumed: res.value.unitsConsumed, deltas, logs };
}
