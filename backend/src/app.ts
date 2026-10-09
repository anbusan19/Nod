import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { z } from "zod";
import type { DB } from "./db/index.js";
import { config } from "./config.js";
import { evaluate, type Policy } from "./policy/engine.js";
import { inspectTransaction } from "./solana/inspect.js";
import type { PushSender } from "./push/sender.js";
import { hashSecret, newId, newPairingCode, newSecret } from "./security.js";
import {
  expireIfStale,
  getPolicy,
  getProposal,
  publicProposal,
  savePolicy,
  spentToday,
  TERMINAL,
  type ProposalRow,
} from "./store.js";

const LAMPORTS_PER_SOL = 1_000_000_000;
// Without a price oracle the demo treats USD limits as a fixed SOL price.
const DEMO_USD_PER_SOL = 150;
const usdToLamports = (usd: number) => Math.round((usd / DEMO_USD_PER_SOL) * LAMPORTS_PER_SOL);

export function defaultPolicy(): Policy {
  return {
    autoLimitLamports: usdToLamports(config.defaultAutoLimitUsd),
    hardCapLamports: usdToLamports(config.defaultHardCapUsd),
    dailyCapLamports: usdToLamports(config.defaultHardCapUsd),
    allowedRecipients: [],
    allowedPrograms: [],
    allowUnknownPrograms: false,
  };
}

interface Deps {
  db: DB;
  push: PushSender;
  now?: () => number;
  /** Source of a fresh recent blockhash. Defaults to the configured RPC node. */
  getBlockhash?: () => Promise<string>;
}

const rpcBlockhash = async () => (await new Connection(config.rpcUrl, "confirmed").getLatestBlockhash()).blockhash;

export function buildApp({ db, push, now = Date.now, getBlockhash = rpcBlockhash }: Deps) {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });

  // Clients send content-type: application/json even on body-less POSTs; treat those as {}.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(Object.assign(new Error("invalid JSON body"), { statusCode: 400 }), undefined);
    }
  });

  // ---- auth helpers -------------------------------------------------------
  const bearer = (req: FastifyRequest) => (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

  function agentFrom(req: FastifyRequest, reply: FastifyReply) {
    const key = bearer(req);
    const agent = key
      ? (db.prepare("SELECT * FROM agents WHERE key_hash = ?").get(hashSecret(key)) as any)
      : undefined;
    if (!agent) reply.code(401).send({ error: "invalid agent key" });
    return agent as { id: string; name: string; frozen: number } | undefined;
  }

  function deviceFrom(req: FastifyRequest, reply: FastifyReply) {
    const tok = bearer(req);
    const device = tok
      ? (db.prepare("SELECT * FROM devices WHERE token_hash = ?").get(hashSecret(tok)) as any)
      : undefined;
    if (!device) reply.code(401).send({ error: "invalid device token" });
    return device as { id: string; wallet: string | null; fcm_token: string | null } | undefined;
  }

  const devicesFor = (agentId: string) =>
    db
      .prepare(
        `SELECT d.* FROM devices d JOIN agent_devices ad ON ad.device_id = d.id WHERE ad.agent_id = ?`,
      )
      .all(agentId) as Array<{ id: string; fcm_token: string | null }>;

  const deviceCanSee = (deviceId: string, agentId: string) =>
    !!db.prepare("SELECT 1 FROM agent_devices WHERE device_id = ? AND agent_id = ?").get(deviceId, agentId);

  // ---- health -------------------------------------------------------------
  app.get("/health", async () => ({ ok: true, cluster: config.cluster }));

  // ---- devices ------------------------------------------------------------
  app.post("/v1/devices", async (req) => {
    const body = z.object({ wallet: z.string().optional(), fcmToken: z.string().optional() }).parse(req.body ?? {});
    const id = newId();
    const token = newSecret("nodd");
    db.prepare("INSERT INTO devices (id, token_hash, wallet, fcm_token, created_at) VALUES (?,?,?,?,?)").run(
      id,
      hashSecret(token),
      body.wallet ?? null,
      body.fcmToken ?? null,
      now(),
    );
    return { deviceId: id, deviceToken: token };
  });

  app.patch("/v1/devices/me", async (req, reply) => {
    const device = deviceFrom(req, reply);
    if (!device) return;
    const body = z.object({ wallet: z.string().optional(), fcmToken: z.string().optional() }).parse(req.body ?? {});
    db.prepare("UPDATE devices SET wallet = COALESCE(?, wallet), fcm_token = COALESCE(?, fcm_token) WHERE id = ?").run(
      body.wallet ?? null,
      body.fcmToken ?? null,
      device.id,
    );
    return { ok: true };
  });

  // ---- pairing ------------------------------------------------------------
  // Phone asks for a short-lived code; the agent redeems it for an API key.
  app.post("/v1/pairings", async (req, reply) => {
    const device = deviceFrom(req, reply);
    if (!device) return;
    const code = newPairingCode();
    const expiresAt = now() + 5 * 60 * 1000;
    db.prepare("INSERT INTO pairings (code, device_id, expires_at) VALUES (?,?,?)").run(code, device.id, expiresAt);
    return { code, expiresAt };
  });

  app.post("/v1/pairings/redeem", async (req, reply) => {
    const body = z.object({ code: z.string(), name: z.string().min(1).max(60) }).parse(req.body);
    const pairing = db.prepare("SELECT * FROM pairings WHERE code = ?").get(body.code.toUpperCase()) as any;
    if (!pairing || pairing.expires_at < now()) return reply.code(400).send({ error: "invalid or expired code" });
    db.prepare("DELETE FROM pairings WHERE code = ?").run(pairing.code);

    const agentId = newId();
    const apiKey = newSecret("nodk");
    db.prepare("INSERT INTO agents (id, name, key_hash, created_at) VALUES (?,?,?,?)").run(
      agentId,
      body.name,
      hashSecret(apiKey),
      now(),
    );
    savePolicy(db, agentId, defaultPolicy());
    db.prepare("INSERT INTO agent_devices (agent_id, device_id) VALUES (?,?)").run(agentId, pairing.device_id);
    return { agentId, apiKey };
  });

  // ---- agents (phone side) ------------------------------------------------
  app.get("/v1/agents", async (req, reply) => {
    const device = deviceFrom(req, reply);
    if (!device) return;
    const rows = db
      .prepare(
        `SELECT a.id, a.name, a.frozen, a.created_at FROM agents a
         JOIN agent_devices ad ON ad.agent_id = a.id WHERE ad.device_id = ? ORDER BY a.created_at`,
      )
      .all(device.id) as any[];
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      frozen: !!a.frozen,
      createdAt: a.created_at,
      policy: getPolicy(db, a.id),
    }));
  });

  app.post("/v1/agents/:id/freeze", async (req, reply) => {
    const device = deviceFrom(req, reply);
    if (!device) return;
    const { id } = req.params as { id: string };
    if (!deviceCanSee(device.id, id)) return reply.code(404).send({ error: "not found" });
    const { frozen } = z.object({ frozen: z.boolean() }).parse(req.body);
    db.prepare("UPDATE agents SET frozen = ? WHERE id = ?").run(frozen ? 1 : 0, id);
    return { ok: true, frozen };
  });

  app.put("/v1/agents/:id/policy", async (req, reply) => {
    const device = deviceFrom(req, reply);
    if (!device) return;
    const { id } = req.params as { id: string };
    if (!deviceCanSee(device.id, id)) return reply.code(404).send({ error: "not found" });
    const p = z
      .object({
        autoLimitLamports: z.number().int().nonnegative(),
        hardCapLamports: z.number().int().nonnegative(),
        dailyCapLamports: z.number().int().nonnegative(),
        allowedRecipients: z.array(z.string()),
        allowedPrograms: z.array(z.string()),
        allowUnknownPrograms: z.boolean(),
      })
      .parse(req.body);
    savePolicy(db, id, p);
    return p;
  });

  // ---- proposals (agent side) ---------------------------------------------
  app.post("/v1/proposals", async (req, reply) => {
    const agent = agentFrom(req, reply);
    if (!agent) return;
    const body = z.object({ transaction: z.string().min(1), reason: z.string().max(280).default("") }).parse(req.body);

    let summary;
    try {
      summary = inspectTransaction(body.transaction);
    } catch {
      return reply.code(400).send({ error: "transaction could not be deserialized" });
    }

    const t = now();
    const policy = getPolicy(db, agent.id) ?? defaultPolicy();
    const decision = evaluate(summary, policy, {
      frozen: !!agent.frozen,
      spentTodayLamports: spentToday(db, agent.id, t),
    });

    const status =
      decision.tier === "block" ? "blocked" : decision.tier === "auto" ? "auto_approved" : "awaiting_human";
    const id = newId();
    db.prepare(
      `INSERT INTO proposals (id, agent_id, tx_base64, tx_hash, reason, tier, status, block_reason,
         lamports, created_at, expires_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      agent.id,
      body.transaction,
      summary.hash,
      body.reason,
      decision.tier,
      status,
      decision.tier === "block" ? decision.reason : null,
      summary.lamports,
      t,
      t + config.proposalTtlSeconds * 1000,
      t,
    );

    if (status === "awaiting_human") {
      for (const d of devicesFor(agent.id)) {
        if (d.fcm_token) push.send(d.fcm_token, id).catch((e) => console.warn("[push] failed:", e.message));
      }
    }
    return reply.code(201).send({ ...publicProposal(getProposal(db, id)!), policyNote: decision.reason });
  });

  const loadFor = (id: string): ProposalRow | undefined => {
    const p = getProposal(db, id);
    return p ? expireIfStale(db, p, now()) : undefined;
  };

  // Both agent (poll) and device (fetch) read a proposal through this route.
  app.get("/v1/proposals/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const p = loadFor(id);
    if (!p) return reply.code(404).send({ error: "not found" });

    const tok = bearer(req);
    const agent = tok ? (db.prepare("SELECT id FROM agents WHERE key_hash = ?").get(hashSecret(tok)) as any) : undefined;
    const device = tok ? (db.prepare("SELECT id FROM devices WHERE token_hash = ?").get(hashSecret(tok)) as any) : undefined;
    const allowed = (agent && agent.id === p.agent_id) || (device && deviceCanSee(device.id, p.agent_id));
    if (!allowed) return reply.code(401).send({ error: "unauthorized" });
    return publicProposal(p);
  });

  // ---- proposals (phone side) ---------------------------------------------
  app.get("/v1/proposals", async (req, reply) => {
    const device = deviceFrom(req, reply);
    if (!device) return;
    const rows = db
      .prepare(
        `SELECT p.*, a.name AS agent_name FROM proposals p
         JOIN agent_devices ad ON ad.agent_id = p.agent_id
         JOIN agents a ON a.id = p.agent_id
         WHERE ad.device_id = ? ORDER BY p.created_at DESC LIMIT 100`,
      )
      .all(device.id) as any[];
    return rows.map((r) => ({ ...publicProposal(expireIfStale(db, r, now())), agentName: r.agent_name }));
  });

  app.post("/v1/proposals/:id/reject", async (req, reply) => {
    const device = deviceFrom(req, reply);
    if (!device) return;
    const p = loadFor((req.params as { id: string }).id);
    if (!p || !deviceCanSee(device.id, p.agent_id)) return reply.code(404).send({ error: "not found" });
    if (p.status !== "awaiting_human") return reply.code(409).send({ error: `proposal is ${p.status}` });
    db.prepare("UPDATE proposals SET status = 'rejected', updated_at = ? WHERE id = ?").run(now(), p.id);
    return { ok: true };
  });

  // A blockhash lives only ~36s on devnet, far less than a human approval takes. The phone asks for
  // a fresh one right before signing. Only the blockhash changes, and the phone checks that.
  app.post("/v1/proposals/:id/refresh", async (req, reply) => {
    const device = deviceFrom(req, reply);
    if (!device) return;
    const p = loadFor((req.params as { id: string }).id);
    if (!p || !deviceCanSee(device.id, p.agent_id)) return reply.code(404).send({ error: "not found" });
    if (p.status !== "awaiting_human") return reply.code(409).send({ error: `proposal is ${p.status}` });

    const tx = VersionedTransaction.deserialize(Buffer.from(p.tx_base64, "base64"));
    if (tx.signatures.some((sig) => sig.some((b) => b !== 0))) {
      return reply.code(409).send({ error: "transaction already carries signatures and cannot be refreshed" });
    }
    tx.message.recentBlockhash = await getBlockhash();
    const txBase64 = Buffer.from(tx.serialize()).toString("base64");
    const summary = inspectTransaction(txBase64);
    db.prepare("UPDATE proposals SET tx_base64 = ?, tx_hash = ?, updated_at = ? WHERE id = ?").run(
      txBase64,
      summary.hash,
      now(),
      p.id,
    );
    return publicProposal(getProposal(db, p.id)!);
  });

  app.post("/v1/proposals/:id/result", async (req, reply) => {
    const device = deviceFrom(req, reply);
    if (!device) return;
    const p = loadFor((req.params as { id: string }).id);
    if (!p || !deviceCanSee(device.id, p.agent_id)) return reply.code(404).send({ error: "not found" });
    if (TERMINAL.includes(p.status)) return reply.code(409).send({ error: `proposal is ${p.status}` });

    const body = z
      .object({
        status: z.enum(["approved", "submitted", "confirmed", "failed"]),
        signature: z.string().optional(),
        error: z.string().optional(),
        // The hash of the transaction the phone actually decoded and signed.
        txHash: z.string(),
      })
      .parse(req.body);
    if (body.txHash !== p.tx_hash) return reply.code(409).send({ error: "transaction hash mismatch" });

    db.prepare(
      "UPDATE proposals SET status = ?, signature = COALESCE(?, signature), error = ?, updated_at = ? WHERE id = ?",
    ).run(body.status, body.signature ?? null, body.error ?? null, now(), p.id);
    return { ok: true };
  });

  return app;
}
