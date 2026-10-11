import { describe, expect, it } from "vitest";
import { builtInServer } from "../config";

describe("builtInServer", () => {
  it("keeps https in every build", () => {
    expect(builtInServer("https://nod.example.com", false)).toBe("https://nod.example.com");
    expect(builtInServer("https://nod.example.com", true)).toBe("https://nod.example.com");
  });
  it("drops http in a release build so the app asks for a server", () => {
    expect(builtInServer("http://localhost:3000", false)).toBe("");
  });
  it("allows http while developing", () => {
    expect(builtInServer("http://localhost:3000", true)).toBe("http://localhost:3000");
  });
  it("treats empty or junk as no server", () => {
    expect(builtInServer(undefined, false)).toBe("");
    expect(builtInServer("  ", true)).toBe("");
    expect(builtInServer("ftp://x", true)).toBe("");
  });
});
