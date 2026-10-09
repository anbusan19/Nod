import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { openDb } from "./db/index.js";
import { LogPushSender } from "./push/sender.js";
import { transferTx } from "./testutil.js";

const payer = Keypair.generate();
const dest = Keypair.generate().publicKey;

const FRESH = Keypair.generate().publicKey.toBase58();
const FRESH_MAINNET = Keypair.generate().publicKey.toBase58();
let t = 1_000_000;
let push: LogPushSender;
let app: ReturnType<typeof buildApp>;

async function json(method: string, url: string, token?: string, payload?: unknown) {
  const res = await app.inject({
    method: method as any,
    url,
    payload: payload as any,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, body: res.json() };
}

async function setup() {
  const dev = (await json("POST", "/v1/devices", undefined, { fcmToken: "fcm-token-123456" })).body;
  const pair = (await json("POST", "/v1/pairings", dev.deviceToken)).body;
  const agent = (await json("POST", "/v1/pairings/redeem", undefined, { code: pair.code, name: "payer-bot" })).body;
  return { dev, agent };
}

beforeEach(() => {
  t = 1_000_000;
  push = new LogPushSender();
  app = buildApp({ db: openDb(":memory:"), push, now: () => t, getBlockhash: async (cluster) => (cluster === "mainnet-beta" ? FRESH_MAINNET : FRESH) });
});

describe("api", () => {
  it("stores and returns the agent's stated intent", async () => {
    const { dev, agent } = await setup();
    const intent = { sol: 0.01, recipient: dest.toBase58() };
    const p = (await json("POST", "/v1/proposals", agent.apiKey, { transaction: transferTx(payer, dest, 1000), reason: "x", intent })).body;
    expect(p.intent).toEqual(intent);
    expect((await json("GET", `/v1/proposals/${p.id}`, dev.deviceToken)).body.intent).toEqual(intent);
    const none = (await json("POST", "/v1/proposals", agent.apiKey, { transaction: transferTx(payer, dest, 1000) })).body;
    expect(none.intent).toBeNull();
  });

  it("refreshes only the blockhash and rebinds the hash", async () => {
    const { dev, agent } = await setup();
    const p = (await json("POST", "/v1/proposals", agent.apiKey, { transaction: transferTx(payer, dest, 1000) })).body;
    const r = await json("POST", `/v1/proposals/${p.id}/refresh`, dev.deviceToken);
    expect(r.status).toBe(200);
    expect(r.body.txHash).not.toBe(p.txHash);
    const before = VersionedTransaction.deserialize(Buffer.from(p.transaction, "base64")).message;
    const after = VersionedTransaction.deserialize(Buffer.from(r.body.transaction, "base64")).message;
    expect(after.recentBlockhash).toBe(FRESH);
    expect(Buffer.from(after.compiledInstructions[0].data)).toEqual(Buffer.from(before.compiledInstructions[0].data));
    expect(after.staticAccountKeys.map(String)).toEqual(before.staticAccountKeys.map(String));
    // the result endpoint now expects the new hash
    const ok = await json("POST", `/v1/proposals/${p.id}/result`, dev.deviceToken, { status: "confirmed", signature: "s", txHash: r.body.txHash });
    expect(ok.status).toBe(200);
  });

  it("tracks the cluster per proposal and refreshes from that cluster's node", async () => {
    const { dev, agent } = await setup();
    const a = (await json("POST", "/v1/proposals", agent.apiKey, { transaction: transferTx(payer, dest, 1000) })).body;
    expect(a.cluster).toBe("devnet");
    const b = (await json("POST", "/v1/proposals", agent.apiKey, { transaction: transferTx(payer, dest, 1000), cluster: "mainnet-beta" })).body;
    expect(b.cluster).toBe("mainnet-beta");
    const r = (await json("POST", `/v1/proposals/${b.id}/refresh`, dev.deviceToken)).body;
    expect(VersionedTransaction.deserialize(Buffer.from(r.transaction, "base64")).message.recentBlockhash).toBe(FRESH_MAINNET);
    expect((await json("POST", "/v1/proposals", agent.apiKey, { transaction: transferTx(payer, dest, 1000), cluster: "moon" })).status).toBe(400);
  });

  it("refuses to refresh a transaction that is no longer awaiting a human", async () => {
    const { dev, agent } = await setup();
    const p = (await json("POST", "/v1/proposals", agent.apiKey, { transaction: transferTx(payer, dest, 1000) })).body;
    await json("POST", `/v1/proposals/${p.id}/reject`, dev.deviceToken);
    expect((await json("POST", `/v1/proposals/${p.id}/refresh`, dev.deviceToken)).status).toBe(409);
  });

  it("accepts body-less POSTs sent with a JSON content type", async () => {
    const dev = (await json("POST", "/v1/devices", undefined, {})).body;
    const res = await app.inject({
      method: "POST",
      url: "/v1/pairings",
      headers: { authorization: `Bearer ${dev.deviceToken}`, "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("rejects unauthenticated proposals", async () => {
    const r = await json("POST", "/v1/proposals", undefined, { transaction: "x" });
    expect(r.status).toBe(401);
  });

  it("routes a new recipient to a human and sends a push", async () => {
    const { agent } = await setup();
    const r = await json("POST", "/v1/proposals", agent.apiKey, {
      transaction: transferTx(payer, dest, 1000),
      reason: "pay for API",
    });
    expect(r.status).toBe(201);
    expect(r.body.tier).toBe("nod");
    expect(r.body.status).toBe("awaiting_human");
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0].proposalId).toBe(r.body.id);
  });

  it("blocks over the hard cap with a reason and sends no push", async () => {
    const { agent } = await setup();
    const r = await json("POST", "/v1/proposals", agent.apiKey, {
      transaction: transferTx(payer, dest, 100 * 1_000_000_000),
      reason: "big",
    });
    expect(r.body.status).toBe("blocked");
    expect(r.body.blockReason).toMatch(/hard cap/);
    expect(push.sent).toHaveLength(0);
  });

  it("runs the full approve flow and enforces the tx hash binding", async () => {
    const { dev, agent } = await setup();
    const p = (
      await json("POST", "/v1/proposals", agent.apiKey, { transaction: transferTx(payer, dest, 1000), reason: "x" })
    ).body;

    const bad = await json("POST", `/v1/proposals/${p.id}/result`, dev.deviceToken, {
      status: "confirmed",
      txHash: "deadbeef",
    });
    expect(bad.status).toBe(409);

    const ok = await json("POST", `/v1/proposals/${p.id}/result`, dev.deviceToken, {
      status: "confirmed",
      signature: "sig123",
      txHash: p.txHash,
    });
    expect(ok.status).toBe(200);

    const polled = await json("GET", `/v1/proposals/${p.id}`, agent.apiKey);
    expect(polled.body.status).toBe("confirmed");
    expect(polled.body.signature).toBe("sig123");
  });

  it("expires stale proposals", async () => {
    const { agent } = await setup();
    const p = (await json("POST", "/v1/proposals", agent.apiKey, { transaction: transferTx(payer, dest, 1000) })).body;
    t += 120_000;
    const polled = await json("GET", `/v1/proposals/${p.id}`, agent.apiKey);
    expect(polled.body.status).toBe("expired");
  });

  it("freezing an agent blocks new proposals", async () => {
    const { dev, agent } = await setup();
    await json("POST", `/v1/agents/${agent.agentId}/freeze`, dev.deviceToken, { frozen: true });
    const r = await json("POST", "/v1/proposals", agent.apiKey, { transaction: transferTx(payer, dest, 1) });
    expect(r.body.status).toBe("blocked");
  });

  it("lets the phone reject, and a rejected proposal cannot be resolved", async () => {
    const { dev, agent } = await setup();
    const p = (await json("POST", "/v1/proposals", agent.apiKey, { transaction: transferTx(payer, dest, 1000) })).body;
    expect((await json("POST", `/v1/proposals/${p.id}/reject`, dev.deviceToken)).status).toBe(200);
    const again = await json("POST", `/v1/proposals/${p.id}/result`, dev.deviceToken, {
      status: "confirmed",
      txHash: p.txHash,
    });
    expect(again.status).toBe(409);
  });
});
