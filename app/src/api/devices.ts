/**
 * This phone registers once with each backend it uses and gets a device token there. The tokens are kept
 * per server, so switching to another server and back keeps the same identity (and its paired agents).
 */
export interface Device {
  deviceId: string;
  deviceToken: string;
}

export interface Store {
  get(key: "devices" | "deviceToken" | "deviceId"): Promise<string | null>;
  set(key: "devices", value: string): Promise<void>;
  remove(key: "deviceToken" | "deviceId"): Promise<void>;
}

type DeviceMap = Record<string, Device>;

async function read(store: Store): Promise<DeviceMap> {
  try {
    return JSON.parse((await store.get("devices")) ?? "{}");
  } catch {
    return {};
  }
}

export async function getDevice(store: Store, serverUrl: string): Promise<Device | undefined> {
  const map = await read(store);
  if (map[serverUrl]) return map[serverUrl];

  // Older installs kept one device token for the one server they used. Adopt it for the first server asked about.
  const deviceToken = await store.get("deviceToken");
  const deviceId = await store.get("deviceId");
  if (deviceToken && deviceId) {
    map[serverUrl] = { deviceId, deviceToken };
    await store.set("devices", JSON.stringify(map));
    await store.remove("deviceToken");
    await store.remove("deviceId");
    return map[serverUrl];
  }
  return undefined;
}

export async function saveDevice(store: Store, serverUrl: string, device: Device): Promise<void> {
  const map = await read(store);
  map[serverUrl] = device;
  await store.set("devices", JSON.stringify(map));
}
