export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
  cluster: (process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? "devnet") as "devnet" | "mainnet-beta",
  rpcUrl: process.env.EXPO_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
};
