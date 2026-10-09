import { ComputeBudgetProgram, Keypair, SystemProgram, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { MAX_PRIORITY_FEE_LAMPORTS, verifySigned } from "../verifySigned";

const owner = Keypair.generate();
const dest = Keypair.generate().publicKey;
const other = Keypair.generate().publicKey;
const BLOCKHASH = "11111111111111111111111111111111";

const build = (ixs: TransactionInstruction[], payer = owner.publicKey, blockhash = BLOCKHASH) =>
  new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());

const transfer = (to = dest, lamports = 10_000_000) => SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: to, lamports });

describe("verifySigned", () => {
  const original = build([transfer()]);

  it("accepts an identical transaction", () => {
    expect(verifySigned(original, build([transfer()]))).toEqual({ ok: true, notes: [] });
  });

  it("accepts compute-budget instructions added by the wallet (what Phantom does)", () => {
    const signed = build([
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 374_000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      transfer(),
    ]);
    const r = verifySigned(original, signed);
    expect(r.ok).toBe(true);
    expect(r.ok && r.notes[0]).toMatch(/added 2/);
  });

  it("rejects a changed recipient", () => {
    const r = verifySigned(original, build([transfer(other)]));
    expect(r).toEqual({ ok: false, reason: "The wallet changed the instructions you approved." });
  });

  it("rejects a changed amount", () => {
    expect(verifySigned(original, build([transfer(dest, 20_000_000)])).ok).toBe(false);
  });

  it("rejects an extra non-wallet instruction", () => {
    const r = verifySigned(original, build([transfer(), transfer(other, 1)]));
    expect(r.ok).toBe(false);
  });

  it("rejects a changed fee payer", () => {
    const r = verifySigned(original, build([transfer()], Keypair.generate().publicKey));
    expect(r).toEqual({ ok: false, reason: "The wallet changed the fee payer." });
  });

  it("accepts a new blockhash only when the caller allows it (the refresh step)", () => {
    const refreshed = build([transfer()], owner.publicKey, Keypair.generate().publicKey.toBase58());
    expect(verifySigned(original, refreshed, [], { allowBlockhashChange: true }).ok).toBe(true);
    expect(verifySigned(original, refreshed).ok).toBe(false);
  });

  it("still rejects changed instructions during a refresh", () => {
    const evil = build([transfer(other, 5)], owner.publicKey, Keypair.generate().publicKey.toBase58());
    expect(verifySigned(original, evil, [], { allowBlockhashChange: true }).ok).toBe(false);
  });

  it("rejects a changed blockhash", () => {
    const r = verifySigned(original, build([transfer()], owner.publicKey, Keypair.generate().publicKey.toBase58()));
    expect(r).toEqual({ ok: false, reason: "The wallet changed the blockhash." });
  });

  it("rejects an excessive priority fee", () => {
    const signed = build([
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000_000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      transfer(),
    ]);
    const r = verifySigned(original, signed);
    expect(r.ok).toBe(false);
    expect(MAX_PRIORITY_FEE_LAMPORTS).toBe(5_000_000n);
  });
});
