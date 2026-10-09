export type ProposalStatus =
  | "awaiting_human"
  | "auto_approved"
  | "approved"
  | "rejected"
  | "expired"
  | "blocked"
  | "submitted"
  | "confirmed"
  | "failed";

/** What the agent says the transaction does. The phone checks it against the real transaction. */
export interface Intent {
  /** Total SOL the transaction sends. */
  sol?: number;
  /** The single address that should receive it. */
  recipient?: string;
}

export interface Proposal {
  id: string;
  agentId: string;
  transaction: string;
  txHash: string;
  reason: string;
  tier: "auto" | "nod" | "council" | "block";
  status: ProposalStatus;
  blockReason: string | null;
  intent: Intent | null;
  cluster: "devnet" | "mainnet-beta";
  signature: string | null;
  error: string | null;
  createdAt: number;
  expiresAt: number;
}

const FINAL: ProposalStatus[] = ["rejected", "expired", "blocked", "confirmed", "failed", "auto_approved"];

export interface NodOptions {
  apiUrl: string;
  agentKey: string;
  fetch?: typeof fetch;
}

export class NodError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class Nod {
  private f: typeof fetch;
  constructor(private opts: NodOptions) {
    this.f = opts.fetch ?? fetch;
  }

  /** Redeem a pairing code shown in the phone app for an agent API key. */
  static async pair(apiUrl: string, code: string, name: string): Promise<{ agentId: string; apiKey: string }> {
    const res = await fetch(`${apiUrl}/v1/pairings/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, name }),
    });
    const body: any = await res.json();
    if (!res.ok) throw new NodError(res.status, body.error ?? "pairing failed");
    return body;
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.f(`${this.opts.apiUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.opts.agentKey}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: any = await res.json();
    if (!res.ok) throw new NodError(res.status, json.error ?? res.statusText);
    return json;
  }

  /** Submit a base64-serialized Solana transaction for approval. */
  propose(input: { transaction: string; reason?: string; intent?: Intent; cluster?: "devnet" | "mainnet-beta" }): Promise<Proposal> {
    return this.req("POST", "/v1/proposals", input);
  }

  get(id: string): Promise<Proposal> {
    return this.req("GET", `/v1/proposals/${id}`);
  }

  /** Polls until the proposal reaches a final state or `timeoutMs` passes. */
  async waitForResult(id: string, opts: { intervalMs?: number; timeoutMs?: number } = {}): Promise<Proposal> {
    const interval = opts.intervalMs ?? 1500;
    const deadline = Date.now() + (opts.timeoutMs ?? 5 * 60_000);
    for (;;) {
      const p = await this.get(id);
      if (FINAL.includes(p.status)) return p;
      if (Date.now() > deadline) throw new NodError(408, "timed out waiting for result");
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}
