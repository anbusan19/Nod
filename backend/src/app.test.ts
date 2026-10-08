import { Keypair } from "@solana/web3.js";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { openDb } from "./db/index.js";
import { LogPushSender } from "./push/sender.js";
import { transferTx } from "./testutil.js";

const payer = Keypair.generate();
const dest = Keypair.generate().publicKey;

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
  app = buildApp({ db: openDb(":memory:"), push, now: () => t });
});

describe("api", () => {
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
