const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 3000),
  cluster: process.env.SOLANA_CLUSTER ?? "devnet",
  rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  /** RPC node per cluster, used when refreshing a blockhash for a proposal on that cluster. */
  rpcUrls: {
    devnet: process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
    "mainnet-beta": process.env.MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  } as Record<string, string>,
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  dbPath: process.env.DATABASE_URL ?? "./nod.db",
  keySalt: process.env.AGENT_API_KEY_SALT ?? "change-me",
  jupiterUrl: process.env.JUPITER_API_URL ?? "https://lite-api.jup.ag/swap/v1",
  defaultAutoLimitUsd: num(process.env.DEFAULT_AUTO_LIMIT_USD, 5),
  defaultHardCapUsd: num(process.env.DEFAULT_HARD_CAP_USD, 500),
  proposalTtlSeconds: num(process.env.PROPOSAL_TTL_SECONDS, 90),
};
