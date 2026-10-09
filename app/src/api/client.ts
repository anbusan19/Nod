import { config } from "../config";
import { kv } from "../storage";

export interface Policy {
  autoLimitLamports: number;
  hardCapLamports: number;
  dailyCapLamports: number;
  allowedRecipients: string[];
  allowedPrograms: string[];
  allowUnknownPrograms: boolean;
}

export interface Agent {
  id: string;
  name: string;
  frozen: boolean;
  createdAt: number;
  policy?: Policy;
}

export type ProposalStatus =
  | "awaiting_human" | "auto_approved" | "approved" | "rejected" | "expired"
  | "blocked" | "submitted" | "confirmed" | "failed";

export interface Proposal {
  id: string;
  agentId: string;
  agentName?: string;
  transaction: string;
  txHash: string;
  reason: string;
  tier: "auto" | "nod" | "council" | "block";
  status: ProposalStatus;
  blockReason: string | null;
  signature: string | null;
  error: string | null;
  createdAt: number;
  expiresAt: number;
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) {
    const token = await kv.get("deviceToken");
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any).error ?? `Request failed (${res.status})`);
  return json as T;
}

export const api = {
  /** Registers this phone with the backend the first time the app runs. */
  async ensureDevice(): Promise<void> {
    if (await kv.get("deviceToken")) return;
    const r = await request<{ deviceId: string; deviceToken: string }>("POST", "/v1/devices", {}, false);
    await kv.set("deviceId", r.deviceId);
    await kv.set("deviceToken", r.deviceToken);
  },
  updateDevice: (d: { wallet?: string; fcmToken?: string }) => request<{ ok: true }>("PATCH", "/v1/devices/me", d),
  createPairing: () => request<{ code: string; expiresAt: number }>("POST", "/v1/pairings"),
  agents: () => request<Agent[]>("GET", "/v1/agents"),
  setFrozen: (id: string, frozen: boolean) => request<{ ok: true }>("POST", `/v1/agents/${id}/freeze`, { frozen }),
  setPolicy: (id: string, p: Policy) => request<Policy>("PUT", `/v1/agents/${id}/policy`, p),
  proposals: () => request<Proposal[]>("GET", "/v1/proposals"),
  proposal: (id: string) => request<Proposal>("GET", `/v1/proposals/${id}`),
  /** Attaches a fresh blockhash to an unsigned transaction; instructions are left untouched. */
  refresh: (id: string) => request<Proposal>("POST", `/v1/proposals/${id}/refresh`),
  reject: (id: string) => request<{ ok: true }>("POST", `/v1/proposals/${id}/reject`),
  result: (id: string, r: { status: "approved" | "submitted" | "confirmed" | "failed"; txHash: string; signature?: string; error?: string }) =>
    request<{ ok: true }>("POST", `/v1/proposals/${id}/result`, r),
};
