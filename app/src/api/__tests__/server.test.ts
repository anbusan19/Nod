import { describe, expect, it } from "vitest";
import { parseServerUrl } from "../server";

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
