// Runs the real SDK against the real backend app, in-process, so the two cannot drift apart.
import { Keypair } from "@solana/web3.js";
import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { openDb } from "../../backend/src/db/index.js";
import { LogPushSender } from "../../backend/src/push/sender.js";
import { Nod, NodAuthError, isConfirmed } from "../src/index.js";
import { transferSol } from "../src/solana.js";

const app = buildApp({ db: openDb(":memory:"), push: new LogPushSender(), getBlockhash: async () => "11111111111111111111111111111111" });

/** Lets the SDK call the in-process backend as if it were over the network. */
const viaApp: typeof fetch = async (input, init) => {
  const u = new URL(String(input));
  const res = await app.inject({ method: (init?.method ?? "GET") as any, url: u.pathname + u.search, headers: init?.headers as any, payload: init?.body as any });
  return new Response(res.body, { status: res.statusCode, headers: Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, String(v)])) });
};

const api = async (method: string, path: string, token?: string, body?: unknown) => {
  const r = await app.inject({ method: method as any, url: path, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body as any });
  return r.json() as any;
};

const connection = { getLatestBlockhash: async () => ({ blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 }) };
const wallet = Keypair.generate().publicKey;
let device: { deviceToken: string };
let nod: Nod;
let agentId: string;

beforeAll(async () => {
  device = await api("POST", "/v1/devices", undefined, {});
  const { code } = await api("POST", "/v1/pairings", device.deviceToken);
  const paired = await Nod.pair("http://nod.local", code, "integration-bot", { fetch: viaApp });
  agentId = paired.agentId;
  nod = new Nod({ apiUrl: "http://nod.local", agentKey: paired.apiKey, fetch: viaApp });
});

describe("SDK against the real backend", () => {
  it("reads the agent's status and limits", async () => {
    const me = await nod.me();
    expect(me).toMatchObject({ agentId, name: "integration-bot", frozen: false });
    expect(me.policy.hardCapLamports).toBeGreaterThan(me.policy.autoLimitLamports);
  });

  it("proposes a transfer built by the helper, and the user rejects it", async () => {
    const built = await transferSol({ connection, from: wallet, to: Keypair.generate().publicKey, sol: 0.01 });
    const p = await nod.propose({ ...built, reason: "pay vendor" });
    expect(p).toMatchObject({ status: "awaiting_human", tier: "nod", reason: "pay vendor", intent: built.intent });

    setTimeout(() => void api("POST", `/v1/proposals/${p.id}/reject`, device.deviceToken), 30);
    const final = await nod.waitForResult(p.id, { intervalMs: 10, timeoutMs: 3000 });
    expect(final.status).toBe("rejected");
    expect(isConfirmed(final)).toBe(false);
  });

  it("a retry with the same idempotency key does not create a second proposal", async () => {
    const built = await transferSol({ connection, from: wallet, to: Keypair.generate().publicKey, sol: 0.02 });
    const a = await nod.propose({ ...built, idempotencyKey: "job-7" });
    const b = await nod.propose({ ...built, idempotencyKey: "job-7" });
    expect(b.id).toBe(a.id);
    expect((await nod.proposals({ limit: 50 })).filter((p) => p.id === a.id)).toHaveLength(1);
  });

  it("lists the agent's own proposals, newest first", async () => {
    const list = await nod.proposals({ limit: 5 });
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].createdAt).toBeGreaterThanOrEqual(list[1].createdAt);
  });

  it("returns a blocked proposal as an outcome, not an exception", async () => {
    const hugeSol = await transferSol({ connection, from: wallet, to: Keypair.generate().publicKey, sol: 1000 });
    const r = await nod.proposeAndWait(hugeSol);
    expect(r.status).toBe("blocked");
    expect(r.blockReason).toMatch(/hard cap/);
  });

  it("surfaces a revoked key as NodAuthError", async () => {
    await api("DELETE", `/v1/agents/${agentId}`, device.deviceToken);
    await expect(nod.me()).rejects.toBeInstanceOf(NodAuthError);
  });
});
