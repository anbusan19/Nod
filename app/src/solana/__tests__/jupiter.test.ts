import { AddressLookupTableAccount, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/jupiter.json";
import { parseJupiterInstruction } from "../jupiter";

const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function jupiterIx(name: keyof typeof fixtures.fixtures) {
  const f = fixtures.fixtures[name];
  const tables = f.tables.map(
    (t) =>
      new AddressLookupTableAccount({
        key: new PublicKey(t.key),
        state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: t.addresses.map((a) => new PublicKey(a)) },
      }),
  );
  const msg = VersionedTransaction.deserialize(Buffer.from(f.tx, "base64")).message;
  const keys = msg.getAccountKeys({ addressLookupTableAccounts: tables });
  const ix = msg.compiledInstructions.find((i) => keys.get(i.programIdIndex)!.toBase58() === JUPITER)!;
  return { data: Buffer.from(ix.data), accounts: ix.accountKeyIndexes.map((i) => keys.get(i)!.toBase58()), quote: f.quote };
}

/**
 * Jupiter's API rounds the minimum up; the parser reports the floor, which is the figure that is
 * guaranteed whichever rounding the program applies. They may differ by one raw unit.
 */
function expectWithinOne(ours: bigint, theirs: bigint) {
  expect(ours).toBeLessThanOrEqual(theirs);
  expect(theirs - ours).toBeLessThanOrEqual(1n);
}

describe("parseJupiterInstruction (real Jupiter transactions)", () => {
  it("reads a shared-accounts exact-in swap and matches Jupiter's own quote", () => {
    const { data, accounts, quote } = jupiterIx("sharedExactIn");
    const r = parseJupiterInstruction(data, accounts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.swap;
    expect(s.variant).toBe("shared_accounts_route");
    expect(s.mode).toBe("exact-in");
    expect(s.inAmount).toBe(BigInt(quote.inAmount));
    expect(s.outAmount).toBe(BigInt(quote.outAmount));
    expectWithinOne(s.outLimit, BigInt(quote.otherAmountThreshold));
    expect(s.slippageBps).toBe(quote.slippageBps);
    expect(s.routeSteps).toBe(2);
    expect(s.sourceMint).toBe(WSOL);
    expect(s.destinationMint).toBe(USDC);
    expect(s.userAuthority).toBe(fixtures.user);
  });

  it("reads a plain route swap (source mint is not in its accounts)", () => {
    const { data, accounts, quote } = jupiterIx("routeExactIn");
    const r = parseJupiterInstruction(data, accounts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.swap.variant).toBe("route");
    expect(r.swap.inAmount).toBe(BigInt(quote.inAmount));
    expectWithinOne(r.swap.outLimit, BigInt(quote.otherAmountThreshold));
    expect(r.swap.sourceMint).toBeUndefined();
    expect(r.swap.destinationMint).toBe(USDC);
    expect(r.swap.userAuthority).toBe(fixtures.user);
  });

  it("reads an exact-out swap: exact amount received, capped amount paid", () => {
    const { data, accounts, quote } = jupiterIx("exactOut");
    const r = parseJupiterInstruction(data, accounts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.swap;
    expect(s.variant).toBe("exact_out_route");
    expect(s.mode).toBe("exact-out");
    expect(s.outAmount).toBe(BigInt(quote.outAmount)); // exactly 1 USDC
    expect(s.outLimit).toBe(BigInt(quote.outAmount));
    expect(s.inAmount).toBe(BigInt(quote.inAmount)); // quoted
    expect(s.inLimit).toBe(BigInt(quote.otherAmountThreshold)); // Jupiter's maximum paid
    expect(s.sourceMint).toBe(WSOL);
    expect(s.destinationMint).toBe(USDC);
  });

  it("refuses instructions it cannot read instead of guessing", () => {
    const { accounts } = jupiterIx("sharedExactIn");
    const bogus = parseJupiterInstruction(Buffer.alloc(60, 7), accounts);
    expect(bogus).toEqual({ ok: false, reason: "Unrecognized Jupiter instruction" });
    expect(parseJupiterInstruction(Buffer.alloc(3), accounts).ok).toBe(false);
  });

  it("rejects truncated data", () => {
    const { data, accounts } = jupiterIx("sharedExactIn");
    expect(parseJupiterInstruction(data.subarray(0, 20), accounts).ok).toBe(false);
  });
});
