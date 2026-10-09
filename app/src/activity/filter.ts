import type { Proposal, ProposalStatus } from "../api/client";

/** Filter chips for the Activity list. Each one is a set of statuses. */
export const STATUS_FILTERS = [
  { key: "all", label: "All", statuses: undefined },
  { key: "confirmed", label: "Confirmed", statuses: ["confirmed", "auto_approved"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
  { key: "blocked", label: "Blocked", statuses: ["blocked"] },
  { key: "expired", label: "Expired", statuses: ["expired"] },
  { key: "failed", label: "Failed", statuses: ["failed"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly ProposalStatus[] | undefined }[];

export type StatusFilterKey = (typeof STATUS_FILTERS)[number]["key"];

export function matchesStatus(p: Proposal, key: StatusFilterKey): boolean {
  const f = STATUS_FILTERS.find((x) => x.key === key);
  const set: readonly ProposalStatus[] | undefined = f?.statuses;
  return !set || set.includes(p.status);
}

/** Apply the status chip and the optional agent chip. Newest first, as the server sends them. */
export function filterActivity(list: Proposal[], status: StatusFilterKey, agentId?: string): Proposal[] {
  return list.filter((p) => matchesStatus(p, status) && (!agentId || p.agentId === agentId));
}

/** How many proposals each status chip would show (within the chosen agent), so empty chips can be hidden. */
export function countByFilter(list: Proposal[], agentId?: string): Record<StatusFilterKey, number> {
  const scoped = agentId ? list.filter((p) => p.agentId === agentId) : list;
  const out = {} as Record<StatusFilterKey, number>;
  for (const f of STATUS_FILTERS) out[f.key] = scoped.filter((p) => matchesStatus(p, f.key)).length;
  return out;
}

/** "Today", "Yesterday" or a date, for the day headings in the list. */
export function dayLabel(ms: number, now: number = Date.now()): string {
  const d = new Date(ms);
  const startOf = (t: Date) => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const diff = Math.round((startOf(new Date(now)) - startOf(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== new Date(now).getFullYear() && { year: "numeric" }) });
}
