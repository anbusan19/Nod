import { AddressLookupTableAccount, Connection, type PublicKey } from "@solana/web3.js";
import { config } from "../config";

export const connection = new Connection(config.rpcUrl, "confirmed");

export async function fetchLookupTables(keys: PublicKey[]): Promise<AddressLookupTableAccount[]> {
  const out: AddressLookupTableAccount[] = [];
  for (const key of keys) {
    const res = await connection.getAddressLookupTable(key);
    if (!res.value) throw new Error(`Address lookup table ${key.toBase58()} not found`);
    out.push(res.value);
  }
  return out;
}
