#!/usr/bin/env node
/**
 * Zero-configuration launcher: `npx nod-server`.
 * Keeps its data and a generated secret in one folder, so a person who just wants to run their own
 * Nod backend never has to know what a salt is, and can't get the security settings wrong.
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { renderBanner, supportsColor } from "./banner.js";

const HELP = `nod-server: the Nod backend

  npx nod-server [--port 3000] [--data ~/.nod] [--cluster devnet|mainnet-beta]

Your phone's Nod app and your agents (nod-sdk) both connect to this server. It never holds your keys.
Data and a generated secret live in the data folder; back it up, and never share secrets.json.
Optional push notifications: put your Firebase service account JSON in the data folder as
firebase-service-account.json. Full guide: docs/DEPLOY.md in the Nod repository.
`;

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

const port = Number(flag("port") ?? process.env.PORT ?? 3000);
const cluster = flag("cluster") ?? process.env.SOLANA_CLUSTER ?? "devnet";
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid --port "${flag("port")}".`);
  process.exit(1);
}
if (cluster !== "devnet" && cluster !== "mainnet-beta") {
  console.error(`Invalid --cluster "${cluster}". Use devnet or mainnet-beta.`);
  process.exit(1);
}

const dataDir = resolve((flag("data") ?? process.env.NOD_DATA_DIR ?? join(homedir(), ".nod")).replace(/^~(?=$|\/)/, homedir()));
mkdirSync(dataDir, { recursive: true, mode: 0o700 });

// The salt protects every agent key and device token. Create it once and keep it: changing it
// would invalidate all of them.
const secretsPath = join(dataDir, "secrets.json");
let salt: string;
if (existsSync(secretsPath)) {
  salt = JSON.parse(readFileSync(secretsPath, "utf8")).salt;
  if (typeof salt !== "string" || salt.length < 24) {
    console.error(`${secretsPath} is damaged. Restore it from a backup; do not delete it, or all agents will have to be paired again.`);
    process.exit(1);
  }
} else {
  salt = randomBytes(32).toString("hex");
  writeFileSync(secretsPath, JSON.stringify({ salt }, null, 2), { mode: 0o600 });
  chmodSync(secretsPath, 0o600);
}

const set = (k: string, v: string) => { if (!process.env[k]) process.env[k] = v; };
set("NODE_ENV", "production");
set("PORT", String(port));
set("DATABASE_URL", join(dataDir, "nod.db"));
set("AGENT_API_KEY_SALT", salt);
set("SOLANA_CLUSTER", cluster);
const firebase = join(dataDir, "firebase-service-account.json");
if (existsSync(firebase)) set("FIREBASE_SERVICE_ACCOUNT_JSON", firebase);
// Push is on if credentials were found in the data folder or supplied through the environment.
const pushOn = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64);

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal)
  .map((n) => n!.address);

set("NOD_REQUEST_LOG", "1");

// Node prints a one-time "SQLite is experimental" notice that only confuses people reading the logs.
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((w: string | Error, ...rest: unknown[]) => {
  if (String(typeof w === "string" ? w : w.message).includes("SQLite")) return;
  (emitWarning as (...a: unknown[]) => void)(w, ...rest);
}) as typeof process.emitWarning;

const version = (() => {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version as string;
  } catch {
    return "unknown";
  }
})();
console.log(renderBanner({ version, cluster, port, dataDir, pushOn, lan }, { color: supportsColor(), columns: process.stdout.columns }));

await import("./index.js");
