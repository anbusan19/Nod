import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for secure storage.
const data: Record<string, string> = {};
vi.mock("../../storage", () => ({
  kv: {
    get: async (k: string) => data[k] ?? null,
    set: async (k: string, v: string) => void (data[k] = v),
    remove: async (k: string) => void delete data[k],
  },
}));

const SERVER = "https://s.example";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

let calls: Array<{ method: string; path: string; auth: string | null }>;
let knownTokens: Set<string>;
let registered: number;

function fakeServer() {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const auth = (init.headers as Record<string, string>).authorization ?? null;
    calls.push({ method: init.method ?? "GET", path, auth });
    if (path === "/v1/devices") {
      registered++;
      const token = `nodd_new${registered}`;
      knownTokens.add(token);
      return json(200, { deviceId: `id${registered}`, deviceToken: token });
    }
    if (!auth || !knownTokens.has(auth.replace("Bearer ", ""))) return json(401, { error: "invalid device token" });
    return json(200, []);
  }) as typeof fetch;
}

beforeEach(() => {
  for (const k of Object.keys(data)) delete data[k];
  data.apiUrl = SERVER;
  data.devices = JSON.stringify({ [SERVER]: { deviceId: "stale", deviceToken: "nodd_stale" } });
  calls = [];
  knownTokens = new Set();
  registered = 0;
  fakeServer();
});

describe("a server that no longer recognises this phone", () => {
  it("registers again and retries the request once, with the new token", async () => {
    const { api, setReregisteredHandler } = await import("../client");
    const handler = vi.fn(async () => {});
    setReregisteredHandler(handler);

    expect(await api.agents()).toEqual([]);

    expect(calls.map((c) => `${c.method} ${c.path} ${c.auth}`)).toEqual([
      "GET /v1/agents Bearer nodd_stale", // refused
      "POST /v1/devices null", // register again
      "GET /v1/agents Bearer nodd_new1", // retried with the new identity
    ]);
    expect(JSON.parse(data.devices)[SERVER].deviceToken).toBe("nodd_new1");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not loop: if the server still refuses, it gives up with the server's message", async () => {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      calls.push({ method: init.method ?? "GET", path, auth: null });
      return path === "/v1/devices" ? json(200, { deviceId: "x", deviceToken: "nodd_x" }) : json(401, { error: "invalid device token" });
    }) as typeof fetch;
    const { api } = await import("../client");

    await expect(api.agents()).rejects.toThrow("invalid device token");
    expect(calls.filter((c) => c.path === "/v1/agents")).toHaveLength(2); // the original and one retry, no more
    expect(calls.filter((c) => c.path === "/v1/devices")).toHaveLength(1);
  });

  it("registers only once when several requests are refused at the same moment", async () => {
    const { api } = await import("../client");
    // the app loads proposals and agents together, so both hit the stale token together
    const [a, b, c] = await Promise.all([api.agents(), api.proposals(), api.agents()]);
    expect([a, b, c]).toEqual([[], [], []]);
    expect(registered).toBe(1);
    expect(calls.filter((x) => x.path === "/v1/devices")).toHaveLength(1);
    expect(Object.keys(JSON.parse(data.devices))).toEqual([SERVER]);
  });

  it("leaves a healthy connection alone", async () => {
    knownTokens.add("nodd_stale");
    const { api } = await import("../client");
    await api.agents();
    expect(calls).toHaveLength(1);
    expect(registered).toBe(0);
  });
});
