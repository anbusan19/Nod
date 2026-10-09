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
