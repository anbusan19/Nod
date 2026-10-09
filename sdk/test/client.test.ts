import { describe, expect, it, vi } from "vitest";
import { Nod, NodAuthError, NodError, NodNetworkError, NodRateLimitError, NodTimeoutError, isConfirmed, isFinal, type Proposal } from "../src/index.js";

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: "p1", agentId: "a1", transaction: "AAAA", txHash: "h", reason: "", tier: "nod", status: "awaiting_human", blockReason: null,
  intent: null, cluster: "devnet", signature: null, error: null, createdAt: 1, expiresAt: 2, ...over,
});
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const client = (fetchImpl: any, extra: object = {}) => new Nod({ apiUrl: "https://nod.test/", agentKey: "nodk_x", fetch: fetchImpl, retries: 3, ...extra });
const noWait = { intervalMs: 1 };

describe("propose", () => {
  it("sends base64, the key, an idempotency key and the intent", async () => {
    const f = vi.fn(async () => reply(201, proposal()));
    await client(f).propose({ transaction: new Uint8Array([1, 2, 3]), reason: "r", intent: { sol: 1 }, cluster: "devnet" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://nod.test/v1/proposals");
    expect((init.headers as any).authorization).toBe("Bearer nodk_x");
    expect((init.headers as any)["idempotency-key"]).toMatch(/.+/);
    expect(JSON.parse(init.body as string)).toMatchObject({ transaction: "AQID", reason: "r", intent: { sol: 1 }, cluster: "devnet" });
  });

  it("accepts any object with serialize() (web3.js transactions)", async () => {
    const f = vi.fn(async () => reply(201, proposal()));
    await client(f).propose({ transaction: { serialize: () => new Uint8Array([255]) } });
    expect(JSON.parse((f.mock.calls[0] as any)[1].body).transaction).toBe("/w==");
  });

  it("uses the same idempotency key on every retry, so a retry cannot duplicate", async () => {
    const keys: string[] = [];
    let n = 0;
    const f = vi.fn(async (_u: string, init: any) => {
      keys.push(init.headers["idempotency-key"]);
      return ++n < 3 ? reply(503, { error: "busy" }) : reply(201, proposal());
    });
    const p = await client(f).propose({ transaction: "AAAA" });
    expect(p.id).toBe("p1");
    expect(f).toHaveBeenCalledTimes(3);
    expect(new Set(keys).size).toBe(1);
  });

  it("honours a caller-supplied idempotency key", async () => {
    const f = vi.fn(async () => reply(201, proposal()));
    await client(f).propose({ transaction: "AAAA", idempotencyKey: "invoice-42" });
    expect((f.mock.calls[0] as any)[1].headers["idempotency-key"]).toBe("invoice-42");
  });
});

describe("errors", () => {
  it("maps 401 to NodAuthError without retrying", async () => {
    const f = vi.fn(async () => reply(401, { error: "invalid agent key" }));
    await expect(client(f).me()).rejects.toBeInstanceOf(NodAuthError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 400 and exposes the validation issues", async () => {
    const f = vi.fn(async () => reply(400, { error: "invalid request", issues: ["intent.sol: Too small"] }));
    const e: any = await client(f).propose({ transaction: "AAAA" }).catch((x) => x);
    expect(e).toBeInstanceOf(NodError);
    expect(e.status).toBe(400);
    expect(e.details).toEqual(["intent.sol: Too small"]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("waits out a 429 using the server's retryAfter, then succeeds", async () => {
    vi.useFakeTimers();
    let n = 0;
    const f = vi.fn(async () => (++n === 1 ? reply(429, { error: "rate limit exceeded", retryAfter: 2 }) : reply(200, { agentId: "a", name: "n", frozen: false, policy: {} })));
    const pending = client(f).me();
    await vi.advanceTimersByTimeAsync(2100);
    await expect(pending).resolves.toMatchObject({ agentId: "a" });
    expect(f).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("surfaces NodRateLimitError when retries run out", async () => {
    const f = vi.fn(async () => reply(429, { error: "slow down", retryAfter: 0.001 }));
    const e = await client(f, { retries: 1 }).me().catch((x) => x);
    expect(e).toBeInstanceOf(NodRateLimitError);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("turns a dead network into NodNetworkError after retries", async () => {
    const f = vi.fn(async () => { throw new TypeError("fetch failed"); });
    await expect(client(f, { retries: 1 }).me()).rejects.toBeInstanceOf(NodNetworkError);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("times out a hung request", async () => {
    const f = vi.fn((_u: string, init: any) => new Promise((_r, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))));
    await expect(client(f, { timeoutMs: 20, retries: 0 }).me()).rejects.toBeInstanceOf(NodTimeoutError);
  });

  it("requires apiUrl and agentKey", () => {
    expect(() => new Nod({ apiUrl: "", agentKey: "k" })).toThrow(/apiUrl/);
    expect(() => new Nod({ apiUrl: "u", agentKey: "" })).toThrow(/agentKey/);
  });
});

describe("waiting for a decision", () => {
  it("polls until final and reports each change", async () => {
    const seq = ["awaiting_human", "awaiting_human", "approved", "confirmed"] as const;
    let i = 0;
    const f = vi.fn(async () => reply(200, proposal({ status: seq[Math.min(i++, seq.length - 1)], signature: i >= 4 ? "sig" : null })));
    const seen: string[] = [];
    const final = await client(f).waitForResult("p1", { ...noWait, onUpdate: (p) => seen.push(p.status) });
    expect(isConfirmed(final)).toBe(true);
    expect(seen).toEqual(["awaiting_human", "approved", "confirmed"]);
  });

  it("times out with NodTimeoutError", async () => {
    const f = vi.fn(async () => reply(200, proposal()));
    await expect(client(f).waitForResult("p1", { intervalMs: 5, timeoutMs: 20 })).rejects.toBeInstanceOf(NodTimeoutError);
  });

  it("can be aborted", async () => {
    const f = vi.fn(async () => reply(200, proposal()));
    const ctl = new AbortController();
    const pending = client(f).waitForResult("p1", { intervalMs: 50, signal: ctl.signal });
    setTimeout(() => ctl.abort(), 10);
    await expect(pending).rejects.toThrow(/aborted/);
  });

  it("proposeAndWait returns blocked and rejected outcomes instead of throwing", async () => {
    const blocked = vi.fn(async () => reply(201, proposal({ status: "blocked", tier: "block", blockReason: "Unknown program" })));
    const r = await client(blocked).proposeAndWait({ transaction: "AAAA" });
    expect(r.status).toBe("blocked");
    expect(isFinal(r) && !isConfirmed(r)).toBe(true);
    expect(blocked).toHaveBeenCalledTimes(1);
  });
});

const health = (over: object = {}) => reply(200, { ok: true, service: "nod", apiVersion: 1, cluster: "devnet", ...over });
const serving = (handlers: Record<string, () => Response>) => vi.fn(async (url: string) => handlers[new URL(url).pathname]?.() ?? reply(404, { error: "nope" }));

describe("pairing", () => {
  it("returns the agent id and key", async () => {
    const f = serving({ "/health": () => health(), "/v1/pairings/redeem": () => reply(200, { agentId: "a1", apiKey: "nodk_abc" }) });
    expect(await Nod.pair("https://nod.test", " 40AD6458 ", "bot", { fetch: f as any })).toEqual({ agentId: "a1", apiKey: "nodk_abc" });
    const redeem = f.mock.calls.find((c) => String(c[0]).endsWith("/redeem")) as any;
    expect(JSON.parse(redeem[1].body)).toEqual({ code: "40AD6458", name: "bot" });
  });
  it("reports a bad code", async () => {
    const f = serving({ "/health": () => health(), "/v1/pairings/redeem": () => reply(400, { error: "invalid or expired code" }) });
    await expect(Nod.pair("https://nod.test", "x", "bot", { fetch: f as any })).rejects.toThrow("invalid or expired code");
  });
});

describe("checkServer", () => {
  const check = (h: Response | Error) => Nod.checkServer("https://nod.test/", { fetch: (async () => { if (h instanceof Error) throw h; return h; }) as any });

  it("accepts a compatible Nod backend", async () => {
    expect(await check(health({ cluster: "mainnet-beta" }))).toEqual({ apiVersion: 1, cluster: "mainnet-beta" });
  });
  it("says so when the address is not a Nod backend", async () => {
    await expect(check(reply(200, { hello: "world" }))).rejects.toThrow(/does not look like a Nod backend/);
    await expect(check(reply(200, { ok: true, cluster: "devnet" }))).rejects.toThrow(/does not look like a Nod backend/); // an old or foreign server without `service`
    await expect(check(reply(404, { error: "not found" }))).rejects.toThrow(/does not look like a Nod backend/);
  });
  it("tells you which side to update when versions differ", async () => {
    await expect(check(health({ apiVersion: 2 }))).rejects.toThrow(/Update nod-sdk/);
    await expect(check(health({ apiVersion: 0 }))).rejects.toThrow(/Upgrade the server/);
  });
  it("reports an unreachable server", async () => {
    await expect(check(new TypeError("fetch failed"))).rejects.toBeInstanceOf(NodNetworkError);
  });
  it("pair refuses an incompatible server before sending the code", async () => {
    const f = serving({ "/health": () => health({ apiVersion: 9 }) });
    await expect(Nod.pair("https://nod.test", "CODE", "bot", { fetch: f as any })).rejects.toThrow(/Update nod-sdk/);
    expect(f.mock.calls.some((c) => String(c[0]).includes("redeem"))).toBe(false);
  });
});
