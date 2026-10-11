export type Cluster = "devnet" | "mainnet-beta";

/**
 * The server baked in at build time. A release build only speaks https, so an http:// address (the usual
 * `adb reverse` setup in .env) is ignored there: the app asks for a server instead of showing a network error.
 */
export function builtInServer(raw: string | undefined, dev: boolean): string {
  const url = (raw ?? "").trim();
  if (!url) return "";
  if (url.startsWith("https://")) return url;
  return dev && url.startsWith("http://") ? url : "";
}

export const config = {
  /** Optional built-in server. Empty means the app asks the user which Nod backend to use. */
  apiUrl: builtInServer(process.env.EXPO_PUBLIC_API_URL, typeof __DEV__ !== "undefined" && __DEV__),
  /**
   * An optional shared demo server the user can choose to use (never used unless they switch it on).
   * Devnet only, no uptime guarantee. Override with EXPO_PUBLIC_COMMUNITY_SERVER, or set it empty to hide the option.
   */
  communityServer: builtInServer(process.env.EXPO_PUBLIC_COMMUNITY_SERVER ?? "https://13-207-143-154.sslip.io", typeof __DEV__ !== "undefined" && __DEV__),
  cluster: (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? "devnet") as Cluster,
  rpcUrl: process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  /** A node per cluster, so a transaction can be decoded and simulated on the cluster it targets. */
  rpcUrls: {
    devnet: process.env.EXPO_PUBLIC_DEVNET_RPC_URL ?? "https://api.devnet.solana.com",
    "mainnet-beta": process.env.EXPO_PUBLIC_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  } as Record<Cluster, string>,
};
