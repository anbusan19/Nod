import { sha256 } from "@noble/hashes/sha2.js";

/**
 * Parser for Jupiter v6 route instructions. Layouts verified against real transactions from
 * Jupiter's swap API (see __tests__/fixtures/jupiter.json). Variants not verified that way are
 * reported as unreadable instead of guessed at.
 */

// Note: never call Buffer methods on the result of `subarray`. Hermes (React Native's JS engine)
// returns a plain Uint8Array from it, which has no readUInt32LE, toString("hex") and so on.
const disc = (name: string) => Buffer.from(sha256(new TextEncoder().encode(`global:${name}`))).toString("hex", 0, 8);

type Variant = "route" | "shared_accounts_route" | "exact_out_route";

interface Layout {
  mode: "exact-in" | "exact-out";
  /** Byte offset of the route-plan vector length. */
  planOffset: number;
  /** Account indexes. `srcMint` is absent for the plain `route` instruction. */
  acct: { authority: number; source: number; destination: number; srcMint?: number; dstMint: number };
}

const LAYOUTS: Record<Variant, Layout> = {
  route: { mode: "exact-in", planOffset: 8, acct: { authority: 1, source: 2, destination: 3, dstMint: 5 } },
  shared_accounts_route: { mode: "exact-in", planOffset: 9, acct: { authority: 2, source: 3, destination: 6, srcMint: 7, dstMint: 8 } },
  exact_out_route: { mode: "exact-out", planOffset: 8, acct: { authority: 1, source: 2, destination: 3, srcMint: 5, dstMint: 6 } },
};

const BY_DISCRIMINATOR = new Map<string, Variant>((Object.keys(LAYOUTS) as Variant[]).map((v) => [disc(v), v]));

/** Jupiter instructions that exist but whose layout was not verified; shown as unreadable. */
const KNOWN_UNVERIFIED = new Set(
  [
    "route_with_token_ledger",
    "shared_accounts_route_with_token_ledger",
    "shared_accounts_exact_out_route",
    "route_v2",
    "shared_accounts_route_v2",
    "exact_out_route_v2",
  ].map(disc),
);

export interface JupiterSwap {
  variant: Variant;
  mode: "exact-in" | "exact-out";
  /** What you pay: exact for exact-in, the quote for exact-out. */
  inAmount: bigint;
  /** The most you can pay (rounded up, so it is a true ceiling): inAmount for exact-in, quote plus slippage for exact-out. */
  inLimit: bigint;
  /** What you receive: the quote for exact-in, exact for exact-out. */
  outAmount: bigint;
  /** The least you receive (rounded down, so it is a true floor): quote minus slippage for exact-in, outAmount for exact-out. */
  outLimit: bigint;
  slippageBps: number;
  platformFeeBps: number;
  routeSteps: number;
  userAuthority: string;
  sourceAccount: string;
  destinationAccount: string;
  sourceMint?: string;
  destinationMint: string;
}

export type JupiterParse = { ok: true; swap: JupiterSwap } | { ok: false; reason: string };

const BPS = 10_000n;

export function parseJupiterInstruction(data: Buffer, accounts: string[]): JupiterParse {
  if (data.length < 8) return { ok: false, reason: "Instruction too short" };
  const key = data.toString("hex", 0, 8);
  const variant = BY_DISCRIMINATOR.get(key);
  if (!variant) {
    return { ok: false, reason: KNOWN_UNVERIFIED.has(key) ? "This Jupiter instruction type is not supported yet" : "Unrecognized Jupiter instruction" };
  }
  const layout = LAYOUTS[variant];
  // The fixed-size fields sit at the very end; the route plan in the middle varies in length.
  const TAIL = 8 + 8 + 2 + 1;
  if (data.length < layout.planOffset + 4 + TAIL) return { ok: false, reason: "Swap data is malformed" };
  const t = data.length - TAIL;
  const first = data.readBigUInt64LE(t);
  const second = data.readBigUInt64LE(t + 8);
  const slippageBps = data.readUInt16LE(t + 16);
  const platformFeeBps = data[t + 18];
  if (slippageBps > 10_000) return { ok: false, reason: "Swap data is malformed" };

  const at = (i: number | undefined) => (i === undefined ? undefined : accounts[i]);
  const { acct } = layout;
  const authority = at(acct.authority);
  const source = at(acct.source);
  const destination = at(acct.destination);
  const dstMint = at(acct.dstMint);
  if (!authority || !source || !destination || !dstMint) return { ok: false, reason: "Swap accounts are missing" };

  const slip = BigInt(slippageBps);
  const exactIn = layout.mode === "exact-in";
  const quoted = second; // quoted_out for exact-in, quoted_in for exact-out
  const swap: JupiterSwap = {
    variant,
    mode: layout.mode,
    inAmount: exactIn ? first : quoted,
    inLimit: exactIn ? first : (quoted * (BPS + slip) + BPS - 1n) / BPS, // ceil
    outAmount: exactIn ? quoted : first,
    outLimit: exactIn ? (quoted * (BPS - slip)) / BPS : first, // floor
    slippageBps,
    platformFeeBps,
    routeSteps: data.readUInt32LE(layout.planOffset),
    userAuthority: authority,
    sourceAccount: source,
    destinationAccount: destination,
    sourceMint: at(acct.srcMint),
    destinationMint: dstMint,
  };
  return { ok: true, swap };
}
