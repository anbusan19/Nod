import type { DB } from "./db/index.js";
import type { Policy, Tier } from "./policy/engine.js";

export type Status =
  | "awaiting_human"
  | "auto_approved"
  | "approved"
  | "rejected"
  | "expired"
  | "blocked"
  | "submitted"
  | "confirmed"
  | "failed";

export interface ProposalRow {
  id: string;
  agent_id: string;
  tx_base64: string;
  tx_hash: string;
  reason: string;
  tier: Tier;
  status: Status;
  block_reason: string | null;
  intent: string | null;
  cluster: string;
  lamports: number;
  signature: string | null;
  error: string | null;
  created_at: number;
  expires_at: number;
  updated_at: number;
}

export const TERMINAL: Status[] = ["rejected", "expired", "blocked", "confirmed", "failed"];

export function getPolicy(db: DB, agentId: string): Policy | undefined {
  const r = db.prepare("SELECT * FROM policies WHERE agent_id = ?").get(agentId) as any;
  if (!r) return undefined;
  return {
    autoLimitLamports: r.auto_limit_lamports,
    hardCapLamports: r.hard_cap_lamports,
    dailyCapLamports: r.daily_cap_lamports,
    allowedRecipients: JSON.parse(r.allowed_recipients),
    allowedPrograms: JSON.parse(r.allowed_programs),
    allowUnknownPrograms: !!r.allow_unknown_programs,
  };
}

export function savePolicy(db: DB, agentId: string, p: Policy) {
  db.prepare(
    `INSERT INTO policies (agent_id, auto_limit_lamports, hard_cap_lamports, daily_cap_lamports,
       allowed_recipients, allowed_programs, allow_unknown_programs)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(agent_id) DO UPDATE SET
       auto_limit_lamports = excluded.auto_limit_lamports,
       hard_cap_lamports = excluded.hard_cap_lamports,
       daily_cap_lamports = excluded.daily_cap_lamports,
       allowed_recipients = excluded.allowed_recipients,
       allowed_programs = excluded.allowed_programs,
       allow_unknown_programs = excluded.allow_unknown_programs`,
  ).run(
    agentId,
    p.autoLimitLamports,
    p.hardCapLamports,
    p.dailyCapLamports,
    JSON.stringify(p.allowedRecipients),
    JSON.stringify(p.allowedPrograms),
    p.allowUnknownPrograms ? 1 : 0,
  );
}

export function spentToday(db: DB, agentId: string, now: number): number {
  const since = now - 24 * 3600 * 1000;
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(lamports), 0) AS s FROM proposals
       WHERE agent_id = ? AND created_at >= ? AND status IN ('auto_approved','approved','submitted','confirmed')`,
    )
    .get(agentId, since) as { s: number };
  return r.s;
}

export function getProposal(db: DB, id: string): ProposalRow | undefined {
  return db.prepare("SELECT * FROM proposals WHERE id = ?").get(id) as ProposalRow | undefined;
}

/** Marks a proposal expired if its time is up and it is still waiting on a human. */
export function expireIfStale(db: DB, p: ProposalRow, now: number): ProposalRow {
  if (p.status === "awaiting_human" && now > p.expires_at) {
    db.prepare("UPDATE proposals SET status = 'expired', updated_at = ? WHERE id = ?").run(now, p.id);
    return { ...p, status: "expired", updated_at: now };
  }
  return p;
}

export function publicProposal(p: ProposalRow) {
  return {
    id: p.id,
    agentId: p.agent_id,
    transaction: p.tx_base64,
    txHash: p.tx_hash,
    reason: p.reason,
    tier: p.tier,
    status: p.status,
    blockReason: p.block_reason,
    intent: p.intent ? JSON.parse(p.intent) : null,
    cluster: p.cluster,
    signature: p.signature,
    error: p.error,
    createdAt: p.created_at,
    expiresAt: p.expires_at,
  };
}
