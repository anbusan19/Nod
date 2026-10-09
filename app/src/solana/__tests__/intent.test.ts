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
