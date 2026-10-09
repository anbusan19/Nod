import { AddressLookupTableAccount, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { decodeTransaction } from "../decode";
import { summarizeSwap } from "../swap";
import fixtures from "./fixtures/jupiter.json";

const OWNER = fixtures.user;
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
type Name = keyof typeof fixtures.fixtures;

function load(name: Name) {
  const f = fixtures.fixtures[name];
  const tables = f.tables.map(
    (t) =>
      new AddressLookupTableAccount({
        key: new PublicKey(t.key),
        state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: t.addresses.map((a) => new PublicKey(a)) },
      }),
  );
  const tx = VersionedTransaction.deserialize(Buffer.from(f.tx, "base64"));
  return { tx, tables };
}
const summarize = (name: Name, owner = OWNER, edit?: (tx: VersionedTransaction) => void) => {
  const { tx, tables } = load(name);
  edit?.(tx);
  const decoded = decodeTransaction(tx, tables);
  return { decoded, summary: summarizeSwap(decoded, owner)! };
};
const jupiterIndex = (tx: VersionedTransaction, tables: AddressLookupTableAccount[]) => {
  const keys = tx.message.getAccountKeys({ addressLookupTableAccounts: tables });
  return tx.message.compiledInstructions.findIndex((i) => keys.get(i.programIdIndex)!.toBase58() === "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
};

describe("summarizeSwap on real Jupiter transactions", () => {
  it("decodes every instruction (no unknown programs) and reads the swap", () => {
    for (const name of Object.keys(fixtures.fixtures) as Name[]) {
      const { decoded, summary } = summarize(name);
      expect(decoded.instructions.some((i) => i.kind === "unknown"), name).toBe(false);
      expect(summary.swap, name).toBeDefined();
      expect(summary.swap!.sourceMint, name).toBe("So11111111111111111111111111111111111111112");
      expect(summary.risks, name).toEqual([]);
    }
  });

  it("hides only the wrap, sync, close and own-account setup around the swap", () => {
    const { decoded, summary } = summarize("sharedExactIn");
    const visible = decoded.instructions.filter((_, i) => !summary.hidden.has(i)).map((i) => i.kind);
    expect(visible).toEqual(["compute-budget", "compute-budget", "swap"]);
  });

  it("another wallet gets no free pass: wrong authority, foreign output, nothing hidden", () => {
    const stranger = Keypair.generate().publicKey.toBase58();
    const { summary } = summarize("sharedExactIn", stranger);
    const codes = summary.risks.map((r) => r.code);
    expect(codes).toContain("swap-wrong-authority");
    expect(codes).toContain("swap-output-elsewhere");
    expect(summary.hidden.size).toBe(0);
  });

  it("does not hide a SOL transfer that is redirected away from the wrapped-SOL account", () => {
    const { decoded, summary } = summarize("sharedExactIn", OWNER, (tx) => {
      const tokenProgramIndex = tx.message.staticAccountKeys.findIndex((k) => k.toBase58() === TOKEN_PROGRAM);
      const wrap = tx.message.compiledInstructions[3];
      wrap.accountKeyIndexes[1] = tokenProgramIndex; // pay SOL somewhere else
    });
    expect(decoded.instructions[3].kind).toBe("sol-transfer");
    expect(summary.hidden.has(3)).toBe(false);
  });

  it("flags high slippage: warn above 1%, danger from 5%", () => {
    const setSlippage = (bps: number) => (tx: VersionedTransaction) => {
      const { tables } = load("sharedExactIn");
      const ix = tx.message.compiledInstructions[jupiterIndex(tx, tables)];
      Buffer.from(ix.data.buffer, ix.data.byteOffset, ix.data.length).writeUInt16LE(bps, ix.data.length - 3);
    };
    expect(summarize("sharedExactIn", OWNER, setSlippage(50)).summary.risks).toEqual([]);
    const warn = summarize("sharedExactIn", OWNER, setSlippage(200)).summary.risks;
    expect(warn.map((r) => [r.code, r.severity])).toEqual([["high-slippage", "warn"]]);
    const bad = summarize("sharedExactIn", OWNER, setSlippage(800)).summary.risks;
    expect(bad.map((r) => [r.code, r.severity])).toEqual([["high-slippage", "danger"]]);
  });

  it("refuses to describe a swap it cannot read", () => {
    const { summary } = summarize("sharedExactIn", OWNER, (tx) => {
      const { tables } = load("sharedExactIn");
      tx.message.compiledInstructions[jupiterIndex(tx, tables)].data.fill(9, 0, 8);
    });
    expect(summary.swap).toBeUndefined();
    expect(summary.risks.map((r) => r.code)).toContain("swap-unreadable");
  });
});
