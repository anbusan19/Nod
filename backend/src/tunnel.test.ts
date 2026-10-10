import { describe, expect, it } from "vitest";
import { parseTunnelUrl, tunnelArgs } from "./tunnel.js";

describe("tunnel output parsing", () => {
  it("finds a cloudflared quick-tunnel URL inside its boxed log line", () => {
    const line = "2026-10-10T08:00:00Z INF |  https://random-words-here.trycloudflare.com  |";
    expect(parseTunnelUrl("cloudflared", line)).toBe("https://random-words-here.trycloudflare.com");
  });
  it("ignores lines without a URL", () => {
    expect(parseTunnelUrl("cloudflared", "INF Requesting new quick Tunnel on trycloudflare.com...")).toBeUndefined();
    expect(parseTunnelUrl("ngrok", "t=2026 lvl=info msg=\"starting web service\"")).toBeUndefined();
  });
  it("reads the url= field from ngrok's logfmt", () => {
    expect(parseTunnelUrl("ngrok", "t=2026 lvl=info msg=\"started tunnel\" addr=http://localhost:3000 url=https://ab12.ngrok-free.app")).toBe("https://ab12.ngrok-free.app");
  });
  it("points each tool at the right local port", () => {
    expect(tunnelArgs("cloudflared", 3000)).toContain("http://localhost:3000");
    expect(tunnelArgs("ngrok", 4000)).toContain("4000");
  });
});
