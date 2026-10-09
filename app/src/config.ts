export type Cluster = "devnet" | "mainnet-beta";

export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
  cluster: (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? "devnet") as Cluster,
  rpcUrl: process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  /** A node per cluster, so a transaction can be decoded and simulated on the cluster it targets. */
  rpcUrls: {
    devnet: process.env.EXPO_PUBLIC_DEVNET_RPC_URL ?? "https://api.devnet.solana.com",
    "mainnet-beta": process.env.EXPO_PUBLIC_MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  } as Record<Cluster, string>,
};
