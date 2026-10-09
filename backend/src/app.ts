import { formatRequestLog, supportsColor } from "./banner.js";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { z } from "zod";
import type { DB } from "./db/index.js";
import { API_VERSION, config } from "./config.js";
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
  /** Source of a fresh recent blockhash for a cluster. Defaults to that cluster's RPC node. */
  getBlockhash?: (cluster: string) => Promise<string>;
}

const rpcBlockhash = async (cluster: string) => {
  const url = config.rpcUrls[cluster];
  if (!url) throw new Error(`no RPC configured for cluster ${cluster}`);
  return (await new Connection(url, "confirmed").getLatestBlockhash()).blockhash;
};

export function buildApp({ db, push, now = Date.now, getBlockhash = rpcBlockhash }: Deps) {
  const app = Fastify({ logger: false, trustProxy: config.trustProxy, bodyLimit: 256 * 1024 });
  app.register(cors, { origin: true });
  if (config.requestLog) {
    const color = supportsColor();
    app.addHook("onResponse", async (req, reply) => {
      const route = req.routeOptions?.url ?? "(no route)";
      if (route === "/health" && reply.statusCode < 400) return; // pollers would drown everything else
      console.log(formatRequestLog({ method: req.method, route, status: reply.statusCode, ms: reply.elapsedTime }, color));
    });
  }
  // Limits are per API key or device token when one is sent, otherwise per client address.
  app.register(rateLimit, {
    global: true,
    max: config.rateLimitPerMinute,
    timeWindow: "1 minute",
    keyGenerator: (req) => (req.headers.authorization ? `t:${req.headers.authorization}` : `ip:${req.ip}`),
    errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, error: `rate limit exceeded, retry in ${Math.ceil(ctx.ttl / 1000)}s`, retryAfter: Math.ceil(ctx.ttl / 1000) }),
  });

  // Clients send content-type: application/json even on body-less POSTs; treat those as {}.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(Object.assign(new Error("invalid JSON body"), { statusCode: 400 }), undefined);
    }
  });

  // Every route is recorded so a test can check the published spec (openapi.yaml) matches the code.
  const routes: string[] = [];
  app.addHook("onRoute", (r) => {
    for (const m of [r.method].flat()) if (m !== "HEAD" && m !== "OPTIONS") routes.push(`${m} ${r.url}`);
  });
  app.decorate("nodRoutes", routes);

  // Invalid request bodies are the caller's fault: answer 400 with the reason, not a 500.
  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: "invalid request", issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    }
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status === 500) console.error("[error]", err);
    return reply.code(status).send({ error: status === 500 ? "internal error" : err.message });
  });

  // ---- auth helpers -------------------------------------------------------
  const bearer = (req: FastifyRequest) => (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");

  function agentFrom(req: FastifyRequest, reply: FastifyReply) {
    const key = bearer(req);
    const agent = key
      ? (db.prepare("SELECT * FROM agents WHERE key_hash = ? AND revoked = 0").get(hashSecret(key)) as any)
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

  // Routes live in their own plugin so the rate limiter's per-route hooks are installed before they register.
  app.register(async (app) => {
  // ---- health -------------------------------------------------------------
  app.get("/health", async () => ({ ok: true, service: "nod", apiVersion: API_VERSION, cluster: config.cluster }));

  // ---- devices ------------------------------------------------------------
  app.post("/v1/devices", { config: { rateLimit: { max: 20, timeWindow: "1 minute", keyGenerator: (r: FastifyRequest) => `ip:${r.ip}` } } }, async (req) => {
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
    // `fcmToken: null` means "stop sending me push notifications"; leaving it out leaves the token alone.
    const body = z.object({ wallet: z.string().optional(), fcmToken: z.string().nullable().optional() }).parse(req.body ?? {});
    const clearPush = body.fcmToken === null;
    db.prepare("UPDATE devices SET wallet = COALESCE(?, wallet), fcm_token = CASE WHEN ? THEN NULL ELSE COALESCE(?, fcm_token) END WHERE id = ?").run(
      body.wallet ?? null,
      clearPush ? 1 : 0,
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

  app.post("/v1/pairings/redeem", { config: { rateLimit: { max: 10, timeWindow: "1 minute", keyGenerator: (r: FastifyRequest) => `ip:${r.ip}` } } }, async (req, reply) => {
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
         JOIN agent_devices ad ON ad.agent_id = a.id WHERE ad.device_id = ? AND a.revoked = 0 ORDER BY a.created_at`,
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

  // Revoke an agent for good: its key stops working and anything it still has pending is closed.
  app.delete("/v1/agents/:id", async (req, reply) => {
    const device = deviceFrom(req, reply);
    if (!device) return;
    const { id } = req.params as { id: string };
    if (!deviceCanSee(device.id, id)) return reply.code(404).send({ error: "not found" });
    db.prepare("UPDATE agents SET revoked = 1, key_hash = ? WHERE id = ?").run(`revoked:${id}`, id);
    db.prepare("UPDATE proposals SET status = 'rejected', updated_at = ? WHERE agent_id = ? AND status = 'awaiting_human'").run(now(), id);
    return { ok: true };
  });

  // Issue a new API key. The old one stops working immediately; the new one is shown only here.
  app.post("/v1/agents/:id/rotate-key", async (req, reply) => {
    const device = deviceFrom(req, reply);
    if (!device) return;
    const { id } = req.params as { id: string };
    if (!deviceCanSee(device.id, id)) return reply.code(404).send({ error: "not found" });
    const apiKey = newSecret("nodk");
    db.prepare("UPDATE agents SET key_hash = ? WHERE id = ? AND revoked = 0").run(hashSecret(apiKey), id);
    return { apiKey };
  });

  // ---- the agent's own view -----------------------------------------------
  app.get("/v1/agent/me", async (req, reply) => {
    const agent = agentFrom(req, reply);
    if (!agent) return;
    return { agentId: agent.id, name: agent.name, frozen: !!agent.frozen, policy: getPolicy(db, agent.id) ?? defaultPolicy() };
  });

  app.get("/v1/agent/proposals", async (req, reply) => {
    const agent = agentFrom(req, reply);
    if (!agent) return;
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(req.query);
    const rows = db.prepare("SELECT * FROM proposals WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?").all(agent.id, limit) as unknown as ProposalRow[];
    return rows.map((r) => publicProposal(expireIfStale(db, r, now())));
  });

  // ---- proposals (agent side) ---------------------------------------------
  app.post("/v1/proposals", async (req, reply) => {
    const agent = agentFrom(req, reply);
    if (!agent) return;
    const body = z
      .object({
        transaction: z.string().min(1),
        reason: z.string().max(280).default(""),
        // What the agent says the transaction does. The phone compares this to the real bytes.
        intent: z
          .object({
            sol: z.number().positive().optional(),
            recipient: z.string().max(64).optional(),
            swap: z
              .object({
                inputMint: z.string().max(64),
                outputMint: z.string().max(64),
                inAmount: z.string().regex(/^\d+$/).optional(),
                minOut: z.string().regex(/^\d+$/).optional(),
              })
              .optional(),
          })
          .optional(),
        // Lets an agent retry safely: the same key returns the original proposal instead of a duplicate.
        idempotencyKey: z.string().min(1).max(128).optional(),
        // Which cluster the transaction is for. Defaults to the backend's own cluster.
        cluster: z.enum(["devnet", "mainnet-beta"]).optional(),
      })
      .parse(req.body);

    const idemKey = (req.headers["idempotency-key"] as string | undefined) ?? body.idempotencyKey;
    if (idemKey) {
      const prior = db.prepare("SELECT * FROM proposals WHERE agent_id = ? AND idempotency_key = ?").get(agent.id, idemKey) as unknown as ProposalRow | undefined;
      if (prior) return reply.code(200).header("idempotent-replay", "true").send(publicProposal(expireIfStale(db, prior, now())));
    }

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
         intent, cluster, idempotency_key, lamports, created_at, expires_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      agent.id,
      body.transaction,
      summary.hash,
      body.reason,
      decision.tier,
      status,
      decision.tier === "block" ? decision.reason : null,
      body.intent ? JSON.stringify(body.intent) : null,
      body.cluster ?? config.cluster,
      idemKey ?? null,
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
    // Who is asking comes first, so an unknown caller learns nothing about which ids exist.
    const tok = bearer(req);
    const agent = tok ? (db.prepare("SELECT id FROM agents WHERE key_hash = ? AND revoked = 0").get(hashSecret(tok)) as any) : undefined;
    const device = tok ? (db.prepare("SELECT id FROM devices WHERE token_hash = ?").get(hashSecret(tok)) as any) : undefined;
    if (!agent && !device) return reply.code(401).send({ error: "invalid credentials" });

    const p = loadFor(id);
    const allowed = p && ((agent && agent.id === p.agent_id) || (device && deviceCanSee(device.id, p.agent_id)));
    // Someone else's proposal looks exactly like one that does not exist.
    if (!p || !allowed) return reply.code(404).send({ error: "not found" });
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
    tx.message.recentBlockhash = await getBlockhash(p.cluster);
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

  });

  return app;
}
