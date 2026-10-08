import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { createApproveInstruction, createTransferCheckedInstruction } from "@solana/spl-token";
import { describe, expect, it } from "vitest";
import { assessRisks, decodeTransaction, formatSol, formatTokenAmount, shorten } from "../decode";

const owner = Keypair.generate();
const other = Keypair.generate().publicKey;

function tx(ixs: TransactionInstruction[]) {
  const msg = new TransactionMessage({
    payerKey: owner.publicKey,
    recentBlockhash: "11111111111111111111111111111111",
    instructions: ixs,
  }).compileToV0Message();
  return new VersionedTransaction(msg);
}
const ctx = (known: string[] = []) => ({ owner: owner.publicKey.toBase58(), knownRecipients: new Set(known) });

describe("decodeTransaction", () => {
  it("decodes a SOL transfer", () => {
    const d = decodeTransaction(tx([SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: other, lamports: 1_500_000_000 })]));
    expect(d.feePayer).toBe(owner.publicKey.toBase58());
    expect(d.instructions).toEqual([
      { kind: "sol-transfer", from: owner.publicKey.toBase58(), to: other.toBase58(), lamports: 1_500_000_000n },
    ]);
  });

  it("decodes an SPL transferChecked and tracks token accounts", () => {
    const src = Keypair.generate().publicKey;
    const dst = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const d = decodeTransaction(tx([createTransferCheckedInstruction(src, mint, dst, owner.publicKey, 25_000_000n, 6)]));
    expect(d.instructions[0]).toMatchObject({
      kind: "spl-transfer",
      source: src.toBase58(),
      destination: dst.toBase58(),
      amount: 25_000_000n,
      decimals: 6,
      mint: mint.toBase58(),
    });
    expect(d.tokenAccounts).toEqual([src.toBase58(), dst.toBase58()]);
  });

  it("flags token delegate approvals as dangerous", () => {
    const src = Keypair.generate().publicKey;
    const d = decodeTransaction(tx([createApproveInstruction(src, other, owner.publicKey, 100n)]));
    const risks = assessRisks(d, ctx());
    expect(risks.map((r) => r.code)).toContain("delegate-approval");
    expect(risks.find((r) => r.code === "delegate-approval")?.severity).toBe("danger");
  });

  it("flags unknown programs", () => {
    const prog = Keypair.generate().publicKey;
    const d = decodeTransaction(tx([new TransactionInstruction({ programId: prog, keys: [], data: Buffer.from([1, 2, 3]) })]));
    expect(d.instructions[0]).toMatchObject({ kind: "unknown", programId: prog.toBase58() });
    expect(assessRisks(d, ctx()).map((r) => r.code)).toEqual(["unknown-program"]);
  });

  it("flags new recipients but not known ones", () => {
    const d = decodeTransaction(tx([SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: other, lamports: 1 })]));
    expect(assessRisks(d, ctx()).map((r) => r.code)).toEqual(["new-recipient"]);
    expect(assessRisks(d, ctx([other.toBase58()]))).toEqual([]);
  });

  it("flags unusually large amounts", () => {
    const d = decodeTransaction(tx([SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: other, lamports: 10 })]));
    const risks = assessRisks(d, { ...ctx([other.toBase58()]), usualMaxLamports: 5n });
    expect(risks.map((r) => r.code)).toEqual(["unusual-amount"]);
  });

  it("decodes memo text as agent-supplied data", () => {
    const memo = new TransactionInstruction({
      programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      keys: [],
      data: Buffer.from("rebalance", "utf8"),
    });
    expect(decodeTransaction(tx([memo])).instructions[0]).toEqual({ kind: "memo", text: "rebalance" });
  });
});

describe("formatting", () => {
  it("formats SOL without trailing zeros", () => {
    expect(formatSol(1_500_000_000n)).toBe("1.5 SOL");
    expect(formatSol(1n)).toBe("0.000000001 SOL");
    expect(formatSol(-2_000_000_000n)).toBe("-2 SOL");
  });
  it("formats token amounts", () => {
    expect(formatTokenAmount(25_000_000n, 6)).toBe("25");
    expect(formatTokenAmount(180_400_000n, 6)).toBe("180.4");
  });
  it("shortens addresses", () => {
    expect(shorten("7xKdAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA9fQ2")).toBe("7xKd…9fQ2");
  });
});
