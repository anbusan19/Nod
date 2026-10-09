import { NodAuthError, NodError, NodNetworkError, NodRateLimitError, NodTimeoutError } from "./errors.js";
import type { AgentInfo, Proposal, ProposalStatus, ProposeInput, TransactionInput, WaitOptions } from "./types.js";

export interface NodOptions {
  /** Base URL of the Nod backend, such as https://api.example.com */
  apiUrl: string;
  /** The key printed when this agent was paired. Keep it secret. */
  agentKey: string;
  /** Override for tests or non-standard runtimes. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Per-request timeout. Default 15 seconds. */
  timeoutMs?: number;
  /** How many times to retry a request that failed in a retryable way. Default 3. */
  retries?: number;
}

/** Statuses after which a proposal will not change. */
const FINAL: ReadonlySet<ProposalStatus> = new Set(["rejected", "expired", "blocked", "confirmed", "failed", "auto_approved"]);

export const isFinal = (p: Pick<Proposal, "status">) => FINAL.has(p.status);

/** True only when the transaction really landed on-chain. */
export const isConfirmed = (p: Pick<Proposal, "status">) => p.status === "confirmed";

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new NodError("aborted"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new NodError("aborted")); }, { once: true });
  });

function toBase64(tx: TransactionInput): string {
  if (typeof tx === "string") return tx;
  const bytes = tx instanceof Uint8Array ? tx : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const newKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

interface Req {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Only retry when repeating the request cannot cause a duplicate. */
  retryable: boolean;
}

export class Nod {
  private readonly f: typeof fetch;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(private readonly opts: NodOptions) {
    if (!opts.apiUrl) throw new NodError("apiUrl is required");
    if (!opts.agentKey) throw new NodError("agentKey is required");
    this.f = opts.fetch ?? globalThis.fetch;
    if (!this.f) throw new NodError("No fetch available. Use Node 18+ or pass `fetch` in the options.");
    this.base = opts.apiUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.retries = opts.retries ?? 3;
  }

  /**
   * Redeem the pairing code shown in the Nod app and get this agent's API key.
   * The key is returned once and the code stops working, so store the key safely.
   */
  static async pair(apiUrl: string, code: string, name: string, opts: { fetch?: typeof fetch } = {}): Promise<{ agentId: string; apiKey: string }> {
    const f = opts.fetch ?? globalThis.fetch;
    const base = apiUrl.replace(/\/+$/, "");
    let res: Response;
    try {
      res = await f(`${base}/v1/pairings/redeem`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim(), name }),
      });
    } catch (e) {
      throw new NodNetworkError(`Could not reach ${base}`, e);
    }
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw toError(res.status, body, res);
    return { agentId: body.agentId, apiKey: body.apiKey };
  }

  /** This agent's name, whether it is frozen, and the limits its user has set. */
  me(): Promise<AgentInfo> {
    return this.request({ method: "GET", path: "/v1/agent/me", retryable: true });
  }

  /** This agent's recent proposals, newest first. */
  proposals(opts: { limit?: number } = {}): Promise<Proposal[]> {
    return this.request({ method: "GET", path: `/v1/agent/proposals?limit=${opts.limit ?? 25}`, retryable: true });
  }

  get(id: string): Promise<Proposal> {
    return this.request({ method: "GET", path: `/v1/proposals/${encodeURIComponent(id)}`, retryable: true });
  }

  /**
   * Submit a transaction for the user's approval. Safe to retry: an idempotency key is attached
   * (yours, or one generated here) so a repeated request never creates a duplicate.
   */
  propose(input: ProposeInput): Promise<Proposal> {
    const key = input.idempotencyKey ?? newKey();
    return this.request({
      method: "POST",
      path: "/v1/proposals",
      headers: { "idempotency-key": key },
      body: { transaction: toBase64(input.transaction), reason: input.reason ?? "", intent: input.intent, cluster: input.cluster },
      retryable: true,
    });
  }

  /** Poll until the proposal reaches a final state. Throws NodTimeoutError if it takes too long. */
  async waitForResult(id: string, opts: WaitOptions = {}): Promise<Proposal> {
    const interval = opts.intervalMs ?? 1500;
    const deadline = Date.now() + (opts.timeoutMs ?? 5 * 60_000);
    let last: ProposalStatus | undefined;
    for (;;) {
      const p = await this.get(id);
      if (p.status !== last) {
        last = p.status;
        opts.onUpdate?.(p);
      }
      if (isFinal(p)) return p;
      if (Date.now() + interval > deadline) throw new NodTimeoutError(`Timed out waiting for a decision on ${id} (last status: ${p.status})`);
      await sleep(interval, opts.signal);
    }
  }

  /**
   * Propose and wait for the outcome. Rejection, expiry and blocks are normal outcomes, so they are
   * returned, not thrown. Check `isConfirmed(result)`.
   */
  async proposeAndWait(input: ProposeInput, opts: WaitOptions = {}): Promise<Proposal> {
    const p = await this.propose(input);
    opts.onUpdate?.(p);
    return isFinal(p) ? p : this.waitForResult(p.id, opts);
  }

  // ------------------------------------------------------------------------------------------

  private async request<T>(req: Req): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.once<T>(req);
      } catch (e) {
        const retryable = e instanceof NodRateLimitError || e instanceof NodNetworkError || (e instanceof NodError && !!e.status && e.status >= 500);
        if (!req.retryable || !retryable || attempt >= this.retries) throw e;
        const wait = e instanceof NodRateLimitError ? e.retryAfterSeconds * 1000 : Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250;
        attempt++;
        await sleep(wait);
      }
    }
  }

  private async once<T>(req: Req): Promise<T> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.f(`${this.base}${req.path}`, {
        method: req.method,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.opts.agentKey}`, ...req.headers },
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: ctl.signal,
      });
    } catch (e) {
      if (ctl.signal.aborted) throw new NodTimeoutError(`Request to ${req.path} timed out after ${this.timeoutMs} ms`);
      throw new NodNetworkError(`Could not reach ${this.base}`, e);
    } finally {
      clearTimeout(timer);
    }
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw toError(res.status, body, res);
    return body as T;
  }
}

function toError(status: number, body: any, res: Response): NodError {
  const message = body?.error ?? `Request failed (${status})`;
  const info = { status, details: body?.issues };
  if (status === 401) return new NodAuthError(message, info);
  if (status === 429) {
    const retry = Number(body?.retryAfter ?? res.headers?.get?.("retry-after") ?? 1);
    return new NodRateLimitError(message, Number.isFinite(retry) && retry > 0 ? retry : 1, info);
  }
  return new NodError(message, info);
}
