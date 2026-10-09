import { describe, expect, it } from "vitest";
import { formatRequestLog, renderBanner, supportsColor } from "./banner.js";

const info = { version: "0.2.1", cluster: "devnet", port: 3000, dataDir: "/home/me/.nod", pushOn: false, lan: ["192.168.1.5"] };

describe("startup banner", () => {
  it("is plain text without colour", () => {
    const out = renderBanner(info, { color: false, columns: 100 });
    expect(out).not.toContain("\x1b");
    for (const s of ["N O D", "0.2.1", "devnet", "/home/me/.nod", "http://localhost:3000", "http://192.168.1.5:3000", "off", "Ctrl+C"]) expect(out).toContain(s);
    expect(out).toMatch(/[⠀-⣿]/); // the knot
  });
  it("uses the lavender accent with colour", () => expect(renderBanner(info, { color: true, columns: 100 })).toContain("\x1b[38;2;153;172;255m"));
  it("drops the logo on a narrow terminal", () => {
    const out = renderBanner(info, { color: false, columns: 60 });
    expect(out).not.toMatch(/[⠀-⣿]/);
    expect(out).toContain("N O D");
  });
  it("never exceeds 80 columns when the logo is shown", () => {
    for (const line of renderBanner({ ...info, lan: [] }, { color: false, columns: 80 }).split("\n")) expect(line.length).toBeLessThanOrEqual(80);
  });
  it("shows a larger knot on a wide terminal and never overflows", () => {
    const small = renderBanner(info, { color: false, columns: 90 }).split("\n").length;
    const wide = renderBanner(info, { color: false, columns: 120 });
    expect(wide.split("\n").length).toBeGreaterThan(small);
    for (const line of wide.split("\n")) expect(line.length).toBeLessThanOrEqual(104);
  });
  it("respects NO_COLOR and non-terminals", () => {
    expect(supportsColor({ isTTY: true }, {})).toBe(true);
    expect(supportsColor({ isTTY: false }, {})).toBe(false);
    expect(supportsColor({ isTTY: true }, { NO_COLOR: "1" })).toBe(false);
    expect(supportsColor({ isTTY: true }, { TERM: "dumb" })).toBe(false);
  });
});

describe("request log line", () => {
  it("shows route patterns, not ids", () => {
    const line = formatRequestLog({ method: "POST", route: "/v1/proposals/:id/result", status: 200, ms: 12.4, at: new Date(2026, 9, 9, 14, 2, 3) }, false);
    expect(line).toBe("14:02:03  200  POST   /v1/proposals/:id/result  12ms");
  });
});
