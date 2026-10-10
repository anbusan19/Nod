/**
 * `nod-server --tunnel`: expose the local server on a public https URL by driving a tunnel tool the
 * person already has (Cloudflare's `cloudflared`, or `ngrok`). Nod runs no relay of its own, so no
 * third party of ours ever sees your proposals.
 */
import { spawn, type ChildProcess } from "node:child_process";

export type TunnelProvider = "cloudflared" | "ngrok";

const URL_PATTERNS: Record<TunnelProvider, RegExp> = {
  cloudflared: /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i,
  ngrok: /url=(https:\/\/[^\s]+)/i,
};

/** Pulls the public URL out of one line of the tool's output, or undefined if the line has none. */
export function parseTunnelUrl(provider: TunnelProvider, line: string): string | undefined {
  const m = URL_PATTERNS[provider].exec(line);
  return m ? (m[1] ?? m[0]) : undefined;
}

export function tunnelArgs(provider: TunnelProvider, port: number): string[] {
  return provider === "cloudflared"
    ? ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`]
    : ["http", String(port), "--log", "stdout", "--log-format", "logfmt"];
}

export const INSTALL_HINT = [
  "--tunnel needs Cloudflare's free tunnel tool (or ngrok), and neither was found.",
  "  macOS:    brew install cloudflared",
  "  Linux:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
  "  Windows:  winget install Cloudflare.cloudflared",
  "Then run nod-server --tunnel again. The server is running locally in the meantime.",
].join("\n");

export interface Tunnel {
  provider: TunnelProvider;
  url: Promise<string>;
  stop: () => void;
}

/** Starts one provider; resolves `url` when it announces one, rejects if it exits or times out. */
export function startTunnel(provider: TunnelProvider, port: number, timeoutMs = 30_000): Tunnel {
  const child: ChildProcess = spawn(provider, tunnelArgs(provider, port), { stdio: ["ignore", "pipe", "pipe"] });
  const url = new Promise<string>((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => { if (!done) { done = true; clearTimeout(timer); fn(); } };
    const timer = setTimeout(() => finish(() => { child.kill(); reject(new Error(`${provider} did not give a URL within ${timeoutMs / 1000}s`)); }), timeoutMs);
    const onData = (buf: Buffer) => {
      for (const line of buf.toString("utf8").split("\n")) {
        const found = parseTunnelUrl(provider, line);
        if (found) return finish(() => resolve(found));
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (e) => finish(() => reject(e)));
    child.on("exit", (code) => finish(() => reject(new Error(`${provider} exited (code ${code}) before a URL was available`))));
  });
  return { provider, url, stop: () => { child.kill(); } };
}

/** Which supported tool is installed? Returns undefined when neither is. */
export async function findProvider(): Promise<TunnelProvider | undefined> {
  for (const p of ["cloudflared", "ngrok"] as const) {
    const ok = await new Promise<boolean>((res) => {
      const c = spawn(p, ["--version"], { stdio: "ignore" });
      c.on("error", () => res(false));
      c.on("exit", (code) => res(code === 0));
    });
    if (ok) return p;
  }
  return undefined;
}
