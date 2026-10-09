/**
 * The list of Nod backends this phone knows about, each with a name the user chose. This is only the list: the
 * phone's identity on each server is stored separately (devices.ts), so removing a server from here does not
 * lose it, and adding the same server back brings its paired agents back.
 */
export interface SavedServer {
  url: string;
  name: string;
  /** Unix milliseconds of the last time this server was switched to. */
  lastUsed: number;
}

export interface ServerStore {
  get(key: "servers"): Promise<string | null>;
  set(key: "servers", value: string): Promise<void>;
}

/** Secure storage is small, so keep the list short. */
export const MAX_SERVERS = 8;
export const MAX_NAME = 40;

/** Same address, however it was typed: scheme and host lower-case, no trailing slash. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
}

/** A readable fallback name: the host (and port), such as "nod.example.com" or "localhost:3000". */
export function defaultName(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

export function cleanName(name: string | undefined, url: string): string {
  const n = (name ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  return n || defaultName(url);
}

export async function loadServers(store: ServerStore): Promise<SavedServer[]> {
  try {
    const raw = JSON.parse((await store.get("servers")) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((s) => s && typeof s.url === "string" && typeof s.name === "string").map((s) => ({ url: s.url, name: s.name, lastUsed: Number(s.lastUsed) || 0 }));
  } catch {
    return [];
  }
}

async function save(store: ServerStore, list: SavedServer[]) {
  await store.set("servers", JSON.stringify(list));
  return list;
}

/** Newest first, with the server in use at the top. */
export function sortServers(list: SavedServer[], current?: string): SavedServer[] {
  const cur = current ? normalizeUrl(current) : undefined;
  return [...list].sort((a, b) => {
    if (normalizeUrl(a.url) === cur) return -1;
    if (normalizeUrl(b.url) === cur) return 1;
    return b.lastUsed - a.lastUsed;
  });
}

/**
 * Add a server, or mark an existing one as just used. An existing server keeps the name the user gave it unless a
 * new name is passed. When the list is full, the least recently used entry (never the one in use) is dropped.
 */
export async function upsertServer(store: ServerStore, url: string, opts: { name?: string; now?: number } = {}): Promise<SavedServer[]> {
  const now = opts.now ?? Date.now();
  const key = normalizeUrl(url);
  const list = await loadServers(store);
  const i = list.findIndex((s) => normalizeUrl(s.url) === key);
  if (i >= 0) {
    list[i] = { ...list[i], name: opts.name === undefined ? list[i].name : cleanName(opts.name, list[i].url), lastUsed: now };
  } else {
    list.push({ url, name: cleanName(opts.name, url), lastUsed: now });
  }
  while (list.length > MAX_SERVERS) {
    const oldest = list.map((s, n) => ({ n, s })).filter(({ s }) => normalizeUrl(s.url) !== key).sort((a, b) => a.s.lastUsed - b.s.lastUsed)[0];
    list.splice(oldest.n, 1);
  }
  return save(store, list);
}

export async function renameServer(store: ServerStore, url: string, name: string): Promise<SavedServer[]> {
  const key = normalizeUrl(url);
  const list = (await loadServers(store)).map((s) => (normalizeUrl(s.url) === key ? { ...s, name: cleanName(name, s.url) } : s));
  return save(store, list);
}

export async function removeServer(store: ServerStore, url: string): Promise<SavedServer[]> {
  const key = normalizeUrl(url);
  return save(store, (await loadServers(store)).filter((s) => normalizeUrl(s.url) !== key));
}
