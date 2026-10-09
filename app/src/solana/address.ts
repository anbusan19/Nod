import { PublicKey } from "@solana/web3.js";

/**
 * Mobile Wallet Adapter returns account addresses base64-encoded. A 32-byte key is
 * always 44 base64 characters ending in "=", and base58 never contains + / or =,
 * so the two can be told apart reliably. Returns the base58 address.
 */
export function normalizeAddress(address: string): string {
  if (/[+/=]/.test(address)) {
    return new PublicKey(Buffer.from(address, "base64")).toBase58();
  }
  return new PublicKey(address).toBase58();
}

/** Same as normalizeAddress, but returns undefined for a value that isn't an address. */
export function tryNormalizeAddress(address: string | null | undefined): string | undefined {
  if (!address) return undefined;
  try {
    return normalizeAddress(address);
  } catch {
    return undefined;
  }
}
