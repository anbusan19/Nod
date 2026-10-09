// Hermes (React Native's engine) returns a plain Uint8Array from Buffer#subarray, because it does not
// honour Symbol.species. Node returns a Buffer, which hid a real bug on the phone. This test makes Node
// behave like Hermes and runs the swap code through it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AddressLookupTableAccount, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { decodeTransaction } from "../decode";
import { summarizeSwap } from "../swap";
import fixtures from "./fixtures/jupiter.json";

const original = Buffer.prototype.subarray;

beforeAll(() => {
  (Buffer.prototype as any).subarray = function (start?: number, end?: number) {
    const bytes = new Uint8Array(this.buffer, this.byteOffset, this.length);
    return Uint8Array.prototype.subarray.call(bytes, start, end); // a plain Uint8Array
  };
});
afterAll(() => {
  Buffer.prototype.subarray = original;
});

describe("under Hermes semantics (Buffer#subarray returns a plain Uint8Array)", () => {
  it("the simulation really is Hermes-like", () => {
    const sub = Buffer.from([1, 2, 3]).subarray(1);
    expect(Buffer.isBuffer(sub)).toBe(false);
    expect(typeof (sub as any).readUInt16LE).toBe("undefined");
  });

  it("still decodes and summarizes every real Jupiter swap", () => {
    for (const [name, f] of Object.entries(fixtures.fixtures)) {
      const tables = f.tables.map(
        (t) =>
          new AddressLookupTableAccount({
            key: new PublicKey(t.key),
            state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: t.addresses.map((a) => new PublicKey(a)) },
          }),
      );
      const decoded = decodeTransaction(VersionedTransaction.deserialize(Buffer.from(f.tx, "base64")), tables);
      const summary = summarizeSwap(decoded, fixtures.user)!;
      expect(summary.swap, name).toBeDefined();
      expect(summary.swap!.inAmount, name).toBe(BigInt(f.quote.inAmount));
    }
  });
});
