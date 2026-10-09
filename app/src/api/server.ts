/** Normalizes what a user typed into a backend URL, or explains why it cannot be used. */
export function parseServerUrl(input: string, opts: { allowInsecure: boolean }): { ok: true; url: string } | { ok: false; reason: string } {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "Enter the address of your Nod backend." };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That does not look like a valid address." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: "Use an http:// or https:// address." };
  if (u.protocol === "http:" && !opts.allowInsecure) {
    return { ok: false, reason: "This build only allows https:// servers. Use an HTTPS address." };
  }
  if (u.username || u.password) return { ok: false, reason: "Do not put a username or password in the address." };
  return { ok: true, url: `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}` };
}

/** The Nod HTTP API version this app speaks (see docs/openapi.yaml). */
export const SUPPORTED_API_VERSION = 1;

export type ServerCheck = { ok: true; apiVersion: number; cluster: string } | { ok: false; reason: string };

/** Asks a server who it is. Never throws; returns a reason the user can act on. */
export async function inspectServer(url: string, fetchImpl: typeof fetch = fetch): Promise<ServerCheck> {
  let res: Response | undefined;
  try {
    res = await fetchImpl(`${url}/health`);
  } catch {
    return { ok: false, reason: `Could not reach ${url}. Check the address and that the server is running.` };
  }
  const body: any = res.ok ? await res.json().catch(() => undefined) : undefined;
  if (!body || body.ok !== true || body.service !== "nod" || typeof body.apiVersion !== "number") {
    return { ok: false, reason: `${url} is not a Nod backend. Check the address.` };
  }
  if (body.apiVersion > SUPPORTED_API_VERSION) {
    return { ok: false, reason: "This server is newer than this app. Update the Nod app." };
  }
  if (body.apiVersion < SUPPORTED_API_VERSION) {
    return { ok: false, reason: "This server is older than this app supports. Upgrade the server." };
  }
  return { ok: true, apiVersion: body.apiVersion, cluster: String(body.cluster ?? "") };
}
