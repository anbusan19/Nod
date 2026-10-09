import { describe, expect, it } from "vitest";
import { MAX_NAME, MAX_SERVERS, cleanName, defaultName, loadServers, normalizeUrl, removeServer, renameServer, sortServers, upsertServer, type ServerStore } from "../servers";

function memory(initial?: string): ServerStore & { raw: () => string | null } {
  let v: string | null = initial ?? null;
  return { get: async () => v, set: async (_k, x) => void (v = x), raw: () => v };
}

describe("names and addresses", () => {
  it("treats differently written addresses as the same server", () => {
    expect(normalizeUrl("HTTPS://Nod.Example.com/")).toBe(normalizeUrl("https://nod.example.com"));
    expect(normalizeUrl("https://nod.example.com/api/")).toBe("https://nod.example.com/api");
  });
  it("falls back to the host when no name is given", () => {
    expect(defaultName("https://www.nod.example.com/x")).toBe("nod.example.com");
    expect(defaultName("http://localhost:3000")).toBe("localhost:3000");
    expect(cleanName("   ", "https://a.example")).toBe("a.example");
  });
  it("tidies names: collapses spaces and caps the length", () => {
    expect(cleanName("  Home   Mac  ", "https://a.example")).toBe("Home Mac");
    expect(cleanName("x".repeat(100), "https://a.example")).toHaveLength(MAX_NAME);
  });
});

describe("saved servers", () => {
  it("adds a server with the name the user gave it", async () => {
    const s = memory();
    const list = await upsertServer(s, "https://nod.example.com", { name: "Team server", now: 10 });
    expect(list).toEqual([{ url: "https://nod.example.com", name: "Team server", lastUsed: 10 }]);
  });

  it("switching to a known server updates when it was used but keeps the name the user chose", async () => {
    const s = memory();
    await upsertServer(s, "https://nod.example.com", { name: "Team server", now: 10 });
    const list = await upsertServer(s, "https://NOD.example.com/", { now: 99 });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Team server", lastUsed: 99 });
  });

  it("renames, and removes only from the list", async () => {
    const s = memory();
    await upsertServer(s, "https://a.example", { now: 1 });
    await upsertServer(s, "https://b.example", { now: 2 });
    await renameServer(s, "https://a.example/", "Home");
    expect((await loadServers(s)).find((x) => x.url === "https://a.example")?.name).toBe("Home");
    const left = await removeServer(s, "https://b.example");
    expect(left.map((x) => x.url)).toEqual(["https://a.example"]);
  });

  it("puts the server in use first, then the most recently used", () => {
    const list = [
      { url: "https://a.example", name: "A", lastUsed: 5 },
      { url: "https://b.example", name: "B", lastUsed: 50 },
      { url: "https://c.example", name: "C", lastUsed: 20 },
    ];
    expect(sortServers(list, "https://a.example/").map((s) => s.name)).toEqual(["A", "B", "C"]);
    expect(sortServers(list).map((s) => s.name)).toEqual(["B", "C", "A"]);
  });

  it("keeps the list short by dropping the least recently used, never the one just added", async () => {
    const s = memory();
    for (let i = 1; i <= MAX_SERVERS + 3; i++) await upsertServer(s, `https://s${i}.example`, { now: i });
    const list = await loadServers(s);
    expect(list).toHaveLength(MAX_SERVERS);
    expect(list.map((x) => x.url)).toContain(`https://s${MAX_SERVERS + 3}.example`);
    expect(list.map((x) => x.url)).not.toContain("https://s1.example");
  });

  it("survives a corrupted store and bad entries", async () => {
    expect(await loadServers(memory("{not json"))).toEqual([]);
    expect(await loadServers(memory('{"a":1}'))).toEqual([]);
    expect(await loadServers(memory('[{"url":"https://ok.example","name":"Ok","lastUsed":3},{"nope":true},null]'))).toEqual([{ url: "https://ok.example", name: "Ok", lastUsed: 3 }]);
  });
});
