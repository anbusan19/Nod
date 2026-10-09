import { AddressLookupTableAccount, Connection, type PublicKey } from "@solana/web3.js";
import { config, type Cluster } from "../config";

const cache = new Map<Cluster, Connection>();

/** A connection to the given cluster. The app's own cluster honours EXPO_PUBLIC_SOLANA_RPC_URL. */
export function connectionFor(cluster: Cluster): Connection {
  let c = cache.get(cluster);
  if (!c) {
    const url = cluster === config.cluster ? config.rpcUrl : config.rpcUrls[cluster];
    c = new Connection(url, "confirmed");
    cache.set(cluster, c);
  }
  return c;
}

export const connection = connectionFor(config.cluster);

export async function fetchLookupTables(keys: PublicKey[], cluster: Cluster = config.cluster): Promise<AddressLookupTableAccount[]> {
  const conn = connectionFor(cluster);
  const out: AddressLookupTableAccount[] = [];
  for (const key of keys) {
    const res = await conn.getAddressLookupTable(key);
    if (!res.value) throw new Error(`Address lookup table ${key.toBase58()} not found on ${cluster}`);
    out.push(res.value);
  }
  return out;
}
