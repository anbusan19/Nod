const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" ? Number(v) : d);

export const config = {
  /** Set when running behind a reverse proxy, so rate limits use the real client address. */
  trustProxy: process.env.TRUST_PROXY === "true",
  rateLimitPerMinute: num(process.env.RATE_LIMIT_PER_MINUTE, 240),
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

/**
 * Refuse to start in production with unsafe settings. A default salt would make every agent
 * key and device token derivable, and changing it later would invalidate all of them.
 */
export function assertProductionConfig() {
  if (process.env.NODE_ENV !== "production") return;
  const problems: string[] = [];
  if (config.keySalt === "change-me" || config.keySalt.length < 24) {
    problems.push("AGENT_API_KEY_SALT must be a random string of at least 24 characters. Set it once and never change it.");
  }
  if (config.dbPath === "./nod.db") problems.push("DATABASE_URL should point at a persistent volume, such as /data/nod.db.");
  if (problems.length > 0) {
    console.error("Refusing to start:\n- " + problems.join("\n- "));
    process.exit(1);
  }
}
