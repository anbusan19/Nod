import { transact, type Web3MobileWallet } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import type { VersionedTransaction } from "@solana/web3.js";
import { config } from "../config";
import { normalizeAddress } from "./address";
import type { Cluster } from "../config";
import { connectionFor } from "./connection";
import { kv } from "../storage";

// How Nod introduces itself to the wallet app (shown on Phantom's connect screen).
// `uri` is kept as the repository for now. `icon` is the favicon.ico at the repository root, as an
// absolute address, because the wallet fetches it without a login: it appears once the repository is
// public. When the product website exists, point both `uri` and `icon` there.
const IDENTITY = {
  name: "Nod",
  uri: "https://github.com/anbusan19/nod",
  icon: "https://raw.githubusercontent.com/anbusan19/Nod/main/favicon.ico",
};

const cluster = config.cluster === "mainnet-beta" ? "mainnet-beta" : "devnet";

export interface WalletSession {
  address: string;
  label?: string;
}

async function authorizeOrReauthorize(wallet: Web3MobileWallet) {
  const cached = await kv.get("mwaAuthToken");
  const auth = cached
    ? await wallet.reauthorize({ auth_token: cached, identity: IDENTITY }).catch(() => undefined)
    : undefined;
  const result = auth ?? (await wallet.authorize({ chain: `solana:${cluster}`, identity: IDENTITY }));
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
