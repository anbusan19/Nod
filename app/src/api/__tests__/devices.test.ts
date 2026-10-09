import { describe, expect, it } from "vitest";
import { getDevice, saveDevice, type Store } from "../devices";

function memory(initial: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get: async (k) => data[k] ?? null,
    set: async (k, v) => void (data[k] = v),
    remove: async (k) => void delete data[k],
  };
}

const a = { deviceId: "id-a", deviceToken: "nodd_a" };
const b = { deviceId: "id-b", deviceToken: "nodd_b" };

describe("per-server device identity", () => {
  it("keeps a separate identity for each server", async () => {
    const s = memory();
    await saveDevice(s, "https://one.example", a);
    await saveDevice(s, "https://two.example", b);
    expect(await getDevice(s, "https://one.example")).toEqual(a);
    expect(await getDevice(s, "https://two.example")).toEqual(b);
    expect(await getDevice(s, "https://three.example")).toBeUndefined();
  });

  it("switching away and back does not lose the original identity", async () => {
    const s = memory();
    await saveDevice(s, "https://one.example", a);
    await saveDevice(s, "https://two.example", b);
    expect(await getDevice(s, "https://one.example")).toEqual(a);
  });

  it("adopts the single device token an older install stored, for the first server asked about", async () => {
    const s = memory({ deviceToken: "nodd_old", deviceId: "old-id" });
    expect(await getDevice(s, "http://localhost:3000")).toEqual({ deviceId: "old-id", deviceToken: "nodd_old" });
    expect(s.data.deviceToken).toBeUndefined();
    expect(await getDevice(s, "https://other.example")).toBeUndefined(); // not handed to a second server
    expect(await getDevice(s, "http://localhost:3000")).toEqual({ deviceId: "old-id", deviceToken: "nodd_old" });
  });

  it("survives a corrupted store", async () => {
    const s = memory({ devices: "{not json" });
    expect(await getDevice(s, "https://one.example")).toBeUndefined();
    await saveDevice(s, "https://one.example", a);
    expect(await getDevice(s, "https://one.example")).toEqual(a);
  });
});
