import { describe, expect, it } from "vitest";
import { renderPairBanner, supportsColor } from "../src/banner.js";

const info = { agentName: "Atlas Treasury", agentId: "657923aa-9df7-48a4-88c5-1cbe5de3a84c", api: "https://nod.example.com" };

describe("renderPairBanner", () => {
  it("shows the knot, the agent and the server", () => {
    const out = renderPairBanner(info, { color: false, columns: 100 });
    expect(out).toContain("⣿");
    expect(out).toContain("Atlas Treasury");
    expect(out).toContain("https://nod.example.com");
    expect(out).toContain("Nothing moves without your Nod.");
  });

  it("is plain text when colour is off", () => {
    expect(renderPairBanner(info, { color: false, columns: 100 })).not.toMatch(/\x1b/);
  });

  it("drops the knot on a narrow terminal instead of wrapping it", () => {
    const out = renderPairBanner(info, { color: false, columns: 50 });
    expect(out).not.toContain("⣿");
    expect(out).toContain("Atlas Treasury");
  });

  it("stays within the terminal width", () => {
    for (const line of renderPairBanner(info, { color: false, columns: 100 }).split("\n")) {
      expect([...line].length).toBeLessThanOrEqual(100);
    }
  });
});

describe("supportsColor", () => {
  it("is off for pipes and when NO_COLOR is set", () => {
    expect(supportsColor({ isTTY: false }, {})).toBe(false);
    expect(supportsColor({ isTTY: true }, { NO_COLOR: "1" })).toBe(false);
    expect(supportsColor({ isTTY: true }, { TERM: "xterm" })).toBe(true);
  });
});
