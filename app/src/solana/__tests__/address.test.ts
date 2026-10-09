import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { normalizeAddress, tryNormalizeAddress } from "../address";

const base58 = "9kk6BhvgvvhYhY9oEyHtBqFektZCgF69S6N5Uw1VSBNL";

describe("normalizeAddress", () => {
  it("decodes the base64 form MWA returns", () => {
    const b64 = Buffer.from(new PublicKey(base58).toBytes()).toString("base64");
    expect(b64).toHaveLength(44);
    expect(b64.endsWith("=")).toBe(true);
    expect(normalizeAddress(b64)).toBe(base58);
  });
  it("passes a base58 address through unchanged", () => {
    expect(normalizeAddress(base58)).toBe(base58);
  });
  it("tolerates junk without throwing", () => {
    expect(tryNormalizeAddress("not an address")).toBeUndefined();
    expect(tryNormalizeAddress(null)).toBeUndefined();
  });
});
