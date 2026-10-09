import { describe, expect, it } from "vitest";
import { inspectServer, parseServerUrl } from "../server";

const strict = { allowInsecure: false };
const dev = { allowInsecure: true };

describe("parseServerUrl", () => {
  it("accepts https and trims trailing slashes and whitespace", () => {
    expect(parseServerUrl("  https://nod.example.com/  ", strict)).toEqual({ ok: true, url: "https://nod.example.com" });
    expect(parseServerUrl("https://nod.example.com:8443/api/", strict)).toEqual({ ok: true, url: "https://nod.example.com:8443/api" });
  });

  it("assumes https when no scheme is typed", () => {
    expect(parseServerUrl("nod.example.com", strict)).toEqual({ ok: true, url: "https://nod.example.com" });
  });

  it("refuses plain http in release builds but allows it in development", () => {
    const r = parseServerUrl("http://192.168.1.5:3000", strict);
    expect(r.ok).toBe(false);
    expect(parseServerUrl("http://192.168.1.5:3000", dev)).toEqual({ ok: true, url: "http://192.168.1.5:3000" });
  });

  it("rejects empty input, other schemes and credentials in the address", () => {
    expect(parseServerUrl("   ", dev).ok).toBe(false);
    expect(parseServerUrl("ftp://nod.example.com", dev).ok).toBe(false);
    expect(parseServerUrl("javascript:alert(1)", dev).ok).toBe(false);
    expect(parseServerUrl("https://user:pw@nod.example.com", dev).ok).toBe(false);
  });
});

describe("inspectServer", () => {
  const answer = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const nod = (over: object = {}) => ({ ok: true, service: "nod", apiVersion: 1, cluster: "devnet", ...over });

  it("accepts a compatible Nod backend", async () => {
    expect(await inspectServer("https://n.example", answer(nod()))).toEqual({ ok: true, apiVersion: 1, cluster: "devnet" });
  });
  it("rejects something that is not a Nod backend, including an old server with no identity", async () => {
    for (const body of [{ hello: "x" }, { ok: true, cluster: "devnet" }, { ok: true, service: "other", apiVersion: 1 }]) {
      const r = await inspectServer("https://n.example", answer(body));
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason).toMatch(/not a Nod backend/);
    }
    expect((await inspectServer("https://n.example", answer({ error: "x" }, 404))).ok).toBe(false);
  });
  it("tells the user which side to update", async () => {
    const newer = await inspectServer("https://n.example", answer(nod({ apiVersion: 2 })));
    const older = await inspectServer("https://n.example", answer(nod({ apiVersion: 0 })));
    expect(!newer.ok && newer.reason).toMatch(/Update the Nod app/);
    expect(!older.ok && older.reason).toMatch(/Upgrade the server/);
  });
  it("explains an unreachable server", async () => {
    const down = (async () => { throw new TypeError("Network request failed"); }) as unknown as typeof fetch;
    const r = await inspectServer("https://n.example", down);
    expect(!r.ok && r.reason).toMatch(/Could not reach https:\/\/n\.example/);
  });
});
