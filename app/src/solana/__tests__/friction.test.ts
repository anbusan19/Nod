import { Keypair, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { decodeTransaction } from "../decode";
import { holdReasons, largeThreshold, solOutflow } from "../friction";

const owner = Keypair.generate().publicKey;
const to = Keypair.generate().publicKey;
const decode = (sol: number) =>
  decodeTransaction(
    new VersionedTransaction(
      new TransactionMessage({
        payerKey: owner,
        recentBlockhash: "11111111111111111111111111111111",
        instructions: [SystemProgram.transfer({ fromPubkey: owner, toPubkey: to, lamports: Math.round(sol * 1e9) })],
      }).compileToV0Message(),
    ),
  );
const AUTO = Math.round(0.033 * 1e9); // the default auto-approve limit, about $5
const base = { intent: undefined, risks: [], autoLimitLamports: AUTO };

describe("friction", () => {
  it("sums only SOL leaving the owner", () => {
    expect(solOutflow(decode(0.5), owner.toBase58())).toBe(500_000_000n);
    expect(solOutflow(decode(0.5), Keypair.generate().publicKey.toBase58())).toBe(0n);
  });

  it("uses a floor of 0.05 SOL and 3x the auto limit above it", () => {
    expect(largeThreshold(0)).toBe(50_000_000n);
    expect(largeThreshold(undefined)).toBe(50_000_000n);
    expect(largeThreshold(AUTO)).toBe(BigInt(AUTO) * 3n); // 0.099 SOL
  });

  it("needs no hold for a small honest payment", () => {
    expect(holdReasons({ ...base, outflowLamports: 10_000_000n })).toEqual([]);
  });

  it("needs a hold for a large amount", () => {
    expect(holdReasons({ ...base, outflowLamports: 500_000_000n })).toEqual(["Large amount"]);
  });

  it("needs a hold for a mismatch", () => {
    const r = holdReasons({ ...base, intent: { status: "mismatch", problems: ["x"] }, outflowLamports: 1n });
    expect(r).toEqual(["Doesn't match the agent"]);
  });

  it("needs a hold for a danger badge but not a warn badge", () => {
    const danger = { code: "delegate-approval" as const, label: "x", severity: "danger" as const };
    const warn = { code: "new-recipient" as const, label: "x", severity: "warn" as const };
    expect(holdReasons({ ...base, risks: [danger], outflowLamports: 0n })).toHaveLength(1);
    expect(holdReasons({ ...base, risks: [warn], outflowLamports: 0n })).toEqual([]);
  });

  it("lists every reason that applies", () => {
    const danger = { code: "authority-change" as const, label: "x", severity: "danger" as const };
    const r = holdReasons({ intent: { status: "mismatch", problems: [] }, risks: [danger], outflowLamports: 900_000_000n, autoLimitLamports: AUTO });
    expect(r).toHaveLength(3);
  });
});
