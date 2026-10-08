import { sha256 } from "@noble/hashes/sha2.js";

/** Hex sha256 of the raw transaction bytes. Matches the backend's `txHash`. */
export function txHash(txBase64: string): string {
  const bytes = Buffer.from(txBase64, "base64");
  return Buffer.from(sha256(bytes)).toString("hex");
}

/** The phone refuses to continue if the bytes it holds differ from what the push promised. */
export function assertHashMatches(txBase64: string, expected: string) {
  if (txHash(txBase64) !== expected) throw new Error("Transaction does not match its proposal hash");
}
