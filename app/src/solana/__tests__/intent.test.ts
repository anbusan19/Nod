import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { decodeTransaction } from "../decode";
import { checkIntent } from "../intent";

const owner = Keypair.generate().publicKey;
const vendor = Keypair.generate().publicKey;
const attacker = Keypair.generate().publicKey;
const sol = (n: number) => Math.round(n * 1e9);

const decode = (ixs: TransactionInstruction[]) =>
  decodeTransaction(
    new VersionedTransaction(
      new TransactionMessage({ payerKey: owner, recentBlockhash: "11111111111111111111111111111111", instructions: ixs }).compileToV0Message(),
    ),
  );
const pay = (to: typeof vendor, n: number) => SystemProgram.transfer({ fromPubkey: owner, toPubkey: to, lamports: sol(n) });
const me = owner.toBase58();

describe("checkIntent", () => {
  it("returns none when the agent stated nothing", () => {
    expect(checkIntent(decode([pay(vendor, 1)]), me, null)).toEqual({ status: "none" });
    expect(checkIntent(decode([pay(vendor, 1)]), me, {})).toEqual({ status: "none" });
  });

  it("matches an honest amount and recipient", () => {
    expect(checkIntent(decode([pay(vendor, 0.01)]), me, { sol: 0.01, recipient: vendor.toBase58() })).toEqual({ status: "match" });
  });

  it("catches the liar: says 0.01 SOL, sends 0.9 SOL to someone else", () => {
    const r = checkIntent(decode([pay(attacker, 0.9)]), me, { sol: 0.01, recipient: vendor.toBase58() });
    expect(r.status).toBe("mismatch");
    if (r.status === "mismatch") {
      expect(r.problems).toHaveLength(2);
      expect(r.problems[0]).toMatch(/0\.01 SOL.*0\.9 SOL/);
    }
  });

  it("catches an amount mismatch with the right recipient", () => {
    const r = checkIntent(decode([pay(vendor, 0.9)]), me, { sol: 0.01, recipient: vendor.toBase58() });
    expect(r.status === "mismatch" && r.problems).toHaveLength(1);
  });

  it("catches an extra hidden transfer to a second address", () => {
    const r = checkIntent(decode([pay(vendor, 0.01), pay(attacker, 0.001)]), me, { recipient: vendor.toBase58() });
    expect(r.status).toBe("mismatch");
  });

  it("catches a claim of payment when no SOL moves", () => {
    const r = checkIntent(decode([SystemProgram.assign({ accountPubkey: owner, programId: attacker })]), me, { recipient: vendor.toBase58() });
    expect(r.status).toBe("mismatch");
  });

  it("tolerates rounding but not real differences", () => {
    expect(checkIntent(decode([pay(vendor, 0.5)]), me, { sol: 0.5 }).status).toBe("match");
    expect(checkIntent(decode([pay(vendor, 0.5)]), me, { sol: 0.51 }).status).toBe("mismatch");
  });

  it("checks only amount when only amount was claimed", () => {
    expect(checkIntent(decode([pay(attacker, 0.01)]), me, { sol: 0.01 }).status).toBe("match");
  });
});

// ---- swap claims, checked against a real Jupiter transaction -----------------------------------
import { AddressLookupTableAccount, PublicKey } from "@solana/web3.js";
import fixtures from "./fixtures/jupiter.json";
import { summarizeSwap } from "../swap";
import { knownToken } from "../tokens";

const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function realSwap() {
  const f = fixtures.fixtures.sharedExactIn;
  const tables = f.tables.map(
    (t) =>
      new AddressLookupTableAccount({
        key: new PublicKey(t.key),
        state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: t.addresses.map((a) => new PublicKey(a)) },
      }),
  );
  const decoded = decodeTransaction(VersionedTransaction.deserialize(Buffer.from(f.tx, "base64")), tables);
  const summary = summarizeSwap(decoded, fixtures.user)!;
  const facts = { swap: summary.swap!, tokens: { [WSOL]: knownToken(WSOL)!, [USDC]: knownToken(USDC)! } };
  return { decoded, facts, quote: f.quote };
}

describe("checkIntent for swaps (real Jupiter transaction)", () => {
  const honest = (q: { inAmount: string; otherAmountThreshold: string }) => ({
    swap: { inputMint: WSOL, outputMint: USDC, inAmount: q.inAmount, minOut: q.otherAmountThreshold },
  });

  it("matches an honest description of the swap", () => {
    const { decoded, facts, quote } = realSwap();
    expect(checkIntent(decoded, fixtures.user, honest(quote), facts)).toEqual({ status: "match" });
  });

  it("catches an agent that promises a better minimum than the transaction enforces", () => {
    const { decoded, facts, quote } = realSwap();
    const r = checkIntent(decoded, fixtures.user, { swap: { ...honest(quote).swap, minOut: "1100000" } }, facts);
    expect(r.status).toBe("mismatch");
    if (r.status === "mismatch") expect(r.problems[0]).toMatch(/promised at least 1\.1 USDC.*as little as 1\.095164 USDC/);
  });

  it("catches a different token being bought", () => {
    const { decoded, facts, quote } = realSwap();
    const r = checkIntent(decoded, fixtures.user, { swap: { ...honest(quote).swap, outputMint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" } }, facts);
    expect(r.status).toBe("mismatch");
  });

  it("catches a different amount being paid", () => {
    const { decoded, facts, quote } = realSwap();
    const r = checkIntent(decoded, fixtures.user, { swap: { ...honest(quote).swap, inAmount: "5000000" } }, facts);
    expect(r.status === "mismatch" && r.problems[0]).toMatch(/pays 0\.005 SOL.*pays 0\.01 SOL/);
  });

  it("flags a swap claim when the transaction holds no readable swap", () => {
    const { decoded, quote } = realSwap();
    expect(checkIntent(decoded, fixtures.user, honest(quote), undefined).status).toBe("mismatch");
  });
});
