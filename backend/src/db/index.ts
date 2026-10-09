import { DatabaseSync } from "node:sqlite";

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  frozen INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS policies (
  agent_id TEXT PRIMARY KEY REFERENCES agents(id),
  auto_limit_lamports INTEGER NOT NULL,
  hard_cap_lamports INTEGER NOT NULL,
  daily_cap_lamports INTEGER NOT NULL,
  allowed_recipients TEXT NOT NULL DEFAULT '[]',
  allowed_programs TEXT NOT NULL DEFAULT '[]',
  allow_unknown_programs INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  wallet TEXT,
  fcm_token TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pairings (
  code TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_devices (
  agent_id TEXT NOT NULL REFERENCES agents(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  PRIMARY KEY (agent_id, device_id)
);
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  tx_base64 TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  tier TEXT NOT NULL,
  status TEXT NOT NULL,
  block_reason TEXT,
  intent TEXT,
  cluster TEXT NOT NULL DEFAULT 'devnet',
  lamports INTEGER NOT NULL DEFAULT 0,
  signature TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS proposals_agent ON proposals(agent_id, created_at);
`;

export function openDb(path: string): DB {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  // Databases created before `intent` existed need the column added.
  const cols = db.prepare("PRAGMA table_info(proposals)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "intent")) db.exec("ALTER TABLE proposals ADD COLUMN intent TEXT");
  if (!cols.some((c) => c.name === "cluster")) db.exec("ALTER TABLE proposals ADD COLUMN cluster TEXT NOT NULL DEFAULT 'devnet'");
  return db;
}
