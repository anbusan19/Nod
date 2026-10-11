import { transact, type Web3MobileWallet } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import type { VersionedTransaction } from "@solana/web3.js";
import { config } from "../config";
import { normalizeAddress } from "./address";
import type { Cluster } from "../config";
import { connectionFor } from "./connection";
import { kv } from "../storage";

// How Nod introduces itself to the wallet app (shown on Phantom's connect screen).
//
// Why Phantom asks to "Connect" before every signature: the MWA 2.0 spec says a wallet should only re-authorize
// silently when it has verified the app's identity. On Android that means Digital Asset Links: the domain in
// `uri` must serve /.well-known/assetlinks.json naming this app's package and signing-certificate fingerprint.
// A GitHub repository URL cannot do that, so Phantom logs "dApp identity is not verified", declines the silent
// re-authorize, and shows the Connect screen each time. See docs/WALLET-IDENTITY.md.
//
// Phantom also rejects an absolute `icon` (-32602, "identity.icon must be a relative URI"), so the icon is a path
// relative to `uri` and only shows once `uri` is a site serving /favicon.ico.
//
// `uri` is the landing site, which serves favicon.ico and /.well-known/assetlinks.json (landing/.well-known).
// The release keystore's SHA-256 must be listed there too, or release builds stay unverified.
const IDENTITY = {
  name: "Nod",
  uri: "https://nod-sol.vercel.app",
  icon: "favicon.ico",
};

const cluster = config.cluster === "mainnet-beta" ? "mainnet-beta" : "devnet";

export interface WalletSession {
  address: string;
  label?: string;
}

async function authorizeOrReauthorize(wallet: Web3MobileWallet) {
  const chain = `solana:${cluster}` as const;
  const cached = await kv.get("mwaAuthToken");

  // MWA 2.0: authorize() with the saved token re-authorizes silently. The older reauthorize() is deprecated and
  // Phantom does not implement it, which used to force a full "Connect" prompt before every signature.
  let result = cached
    ? await wallet.authorize({ chain, identity: IDENTITY, auth_token: cached }).catch((e: unknown) => {
        if (__DEV__) console.log("[mwa] silent re-authorize failed, asking the wallet to connect again:", (e as Error).message);
        return undefined;
      })
    : undefined;
  if (__DEV__ && result) console.log("[mwa] silent re-authorize ok (no Connect prompt)");
  result ??= await wallet.authorize({ chain, identity: IDENTITY });

  await kv.set("mwaAuthToken", result.auth_token);
  const account = result.accounts[0];
  const address = normalizeAddress(account.address);
  await kv.set("walletAddress", address);
  return { address, label: account.label };
}

/** Connects a wallet and remembers the authorization. */
export async function connectWallet(): Promise<WalletSession> {
  return transact(async (wallet) => authorizeOrReauthorize(wallet));
}

export async function disconnectWallet() {
  const token = await kv.get("mwaAuthToken");
  if (token) {
    await transact(async (wallet) => wallet.deauthorize({ auth_token: token })).catch(() => {});
  }
  await kv.remove("mwaAuthToken");
  await kv.remove("walletAddress");
}

/**
 * Asks the wallet to sign. The wallet performs its own device-auth check.
 * Returns the signed transaction; the caller submits it.
 */
export async function signWithWallet(tx: VersionedTransaction, expectedSigner: string): Promise<VersionedTransaction> {
  return transact(async (wallet) => {
    const session = await authorizeOrReauthorize(wallet);
    if (session.address !== expectedSigner) {
      throw new Error("Connected wallet is not the account this transaction needs to be signed by");
    }
    const [signed] = await wallet.signTransactions({ transactions: [tx] });
    return signed;
  });
}

/** Submits and waits for confirmation, giving up once the blockhash can no longer land. */
export async function sendAndConfirm(signed: VersionedTransaction, blockhash: string, cluster: Cluster) {
  const connection = connectionFor(cluster);
  const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  for (;;) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const st = value[0];
    if (st?.err) throw new Error(`Transaction failed: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return signature;
    if (!(await connection.isBlockhashValid(blockhash, { commitment: "confirmed" })).value) {
      throw new Error("Transaction expired before it was confirmed");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}
