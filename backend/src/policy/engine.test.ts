import { Keypair } from "@solana/web3.js";
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

describe("policy engine", () => {
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
