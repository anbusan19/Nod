import { describe, expect, it } from "vitest";
import type { Proposal, ProposalStatus } from "../../api/client";
import { countByFilter, dayLabel, filterActivity } from "../filter";

const mk = (id: string, agentId: string, status: ProposalStatus): Proposal => ({ id, agentId, status } as Proposal);
const list = [mk("1", "a", "confirmed"), mk("2", "a", "auto_approved"), mk("3", "b", "rejected"), mk("4", "b", "blocked"), mk("5", "a", "expired"), mk("6", "b", "failed"), mk("7", "a", "awaiting_human")];

describe("activity filters", () => {
  it("all shows everything", () => expect(filterActivity(list, "all")).toHaveLength(7));
  it("confirmed includes auto-approved", () => expect(filterActivity(list, "confirmed").map((p) => p.id)).toEqual(["1", "2"]));
  it("combines status and agent", () => {
    expect(filterActivity(list, "rejected", "a")).toEqual([]);
    expect(filterActivity(list, "rejected", "b").map((p) => p.id)).toEqual(["3"]);
    expect(filterActivity(list, "all", "b")).toHaveLength(3);
  });
  it("counts per chip within an agent", () => {
    expect(countByFilter(list).confirmed).toBe(2);
    expect(countByFilter(list, "b")).toMatchObject({ all: 3, confirmed: 0, rejected: 1, blocked: 1, failed: 1, expired: 0 });
  });
  it("labels days", () => {
    const now = new Date(2026, 9, 9, 15).getTime();
    expect(dayLabel(new Date(2026, 9, 9, 1).getTime(), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 9, 8, 23).getTime(), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 9, 1).getTime(), now)).not.toMatch(/Today|Yesterday/);
  });
});
