import { config } from "../config";
import { kv } from "../storage";
import { getDevice, saveDevice } from "./devices";

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
  intent: import("../solana/intent").Intent | null;
  cluster: "devnet" | "mainnet-beta";
  signature: string | null;
  error: string | null;
  createdAt: number;
  expiresAt: number;
}

/** The backend this install talks to: the user's saved choice, else the address built into the app. */
export async function getServerUrl(): Promise<string> {
  return (await kv.get("apiUrl")) || config.apiUrl;
}

async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const base = await getServerUrl();
  if (auth) {
    const device = await getDevice(kv, base);
    if (device) headers.authorization = `Bearer ${device.deviceToken}`;
  }
  const res = await fetch(`${base}${path}`, {
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
    const base = await getServerUrl();
    if (await getDevice(kv, base)) return;
    await saveDevice(kv, base, await request<{ deviceId: string; deviceToken: string }>("POST", "/v1/devices", {}, false));
  },
  updateDevice: (d: { wallet?: string; fcmToken?: string | null }) => request<{ ok: true }>("PATCH", "/v1/devices/me", d),
  createPairing: () => request<{ code: string; expiresAt: number }>("POST", "/v1/pairings"),
  agents: () => request<Agent[]>("GET", "/v1/agents"),
  setFrozen: (id: string, frozen: boolean) => request<{ ok: true }>("POST", `/v1/agents/${id}/freeze`, { frozen }),
  setPolicy: (id: string, p: Policy) => request<Policy>("PUT", `/v1/agents/${id}/policy`, p),
  proposals: () => request<Proposal[]>("GET", "/v1/proposals"),
  proposal: (id: string) => request<Proposal>("GET", `/v1/proposals/${id}`),
  /** Attaches a fresh blockhash to an unsigned transaction; instructions are left untouched. */
  refresh: (id: string) => request<Proposal>("POST", `/v1/proposals/${id}/refresh`),
  /** Revoke an agent for good. Its key stops working immediately. */
  removeAgent: (id: string) => request<{ ok: true }>("DELETE", `/v1/agents/${id}`),
  /** Issue a new key for an agent. The old key stops working; the new one is returned once. */
  rotateKey: (id: string) => request<{ apiKey: string }>("POST", `/v1/agents/${id}/rotate-key`),
  /** Point this install at another backend. It registers there once; switching back keeps its old identity. */
  async setServer(url: string | undefined): Promise<void> {
    if (url) await kv.set("apiUrl", url);
    else await kv.remove("apiUrl");
    if (await getServerUrl()) await api.ensureDevice();
  },
  reject: (id: string) => request<{ ok: true }>("POST", `/v1/proposals/${id}/reject`),
  result: (id: string, r: { status: "approved" | "submitted" | "confirmed" | "failed"; txHash: string; signature?: string; error?: string }) =>
    request<{ ok: true }>("POST", `/v1/proposals/${id}/result`, r),
};
