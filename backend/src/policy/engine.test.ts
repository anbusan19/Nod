import { Keypair, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { inspectTransaction } from "../solana/inspect.js";
import { transferTx } from "../testutil.js";
import { evaluate, type Policy } from "./engine.js";

const payer = Keypair.generate();
const friend = Keypair.generate().publicKey;
const policy: Policy = {
  autoLimitLamports: 1_000,
  hardCapLamports: 100_000,
  dailyCapLamports: 150_000,
  allowedRecipients: [friend.toBase58()],
  allowedPrograms: [],
  allowUnknownPrograms: false,
};
const ctx = { frozen: false, spentTodayLamports: 0 };
const run = (lamports: number, to = friend, c = ctx) =>
  evaluate(inspectTransaction(transferTx(payer, to, lamports)), policy, c);

const txOf = (ixs: TransactionInstruction[]) =>
  Buffer.from(
    new VersionedTransaction(
      new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: "11111111111111111111111111111111", instructions: ixs }).compileToV0Message(),
    ).serialize(),
  ).toString("base64");

describe("policy engine", () => {
  it("blocks a System assign that would hand the wallet to another program", () => {
    const assign = SystemProgram.assign({ accountPubkey: payer.publicKey, programId: Keypair.generate().publicKey });
    const d = evaluate(inspectTransaction(txOf([assign])), policy, ctx);
    expect(d.tier).toBe("block");
  });
  it("never auto-approves anything beyond plain SOL transfers", () => {
    const create = SystemProgram.createAccount({
      fromPubkey: payer.publicKey, newAccountPubkey: Keypair.generate().publicKey, lamports: 0, space: 0, programId: SystemProgram.programId,
    });
    const d = evaluate(inspectTransaction(txOf([create])), policy, ctx);
    expect(d.tier).toBe("nod");
  });
  it("auto-approves small transfers to allowlisted recipients", () => {
    expect(run(500).tier).toBe("auto");
  });
  it("needs a Nod over the auto limit", () => {
    expect(run(5_000).tier).toBe("nod");
  });
  it("needs a Nod for a new recipient", () => {
    expect(run(10, Keypair.generate().publicKey).tier).toBe("nod");
  });
  it("blocks above the hard cap", () => {
    expect(run(200_000).tier).toBe("block");
  });
  it("blocks when the daily cap would be exceeded", () => {
    expect(run(90_000, friend, { frozen: false, spentTodayLamports: 100_000 }).tier).toBe("block");
  });
  it("blocks a frozen agent", () => {
    expect(run(1, friend, { frozen: true, spentTodayLamports: 0 }).tier).toBe("block");
  });
});
