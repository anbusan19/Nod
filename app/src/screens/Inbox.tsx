import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { STATUS_FILTERS, countByFilter, dayLabel, filterActivity, type StatusFilterKey } from "../activity/filter";
import type { Proposal } from "../api/client";
import { Badge, Card, Mono, T } from "../components/ui";
import { useApp } from "../state";
import { formatSol, deserialize, decodeTransaction, shorten } from "../solana/decode";
import { Logo } from "../components/Logo";
import { useColors } from "../theme/colors";

function summary(p: Proposal): string {
  try {
    const ix = decodeTransaction(deserialize(p.transaction)).instructions.find((i) => i.kind !== "compute-budget");
    if (ix?.kind === "sol-transfer") return `Send ${formatSol(ix.lamports)} to ${shorten(ix.to)}`;
    if (ix?.kind === "spl-transfer") return `Token transfer to ${shorten(ix.destination)}`;
    if (ix?.kind === "swap") return "Token swap (Jupiter)";
  } catch {
    // Lookup tables can't be resolved offline. A Jupiter program id is still visible in the message.
    try {
      if (deserialize(p.transaction).message.staticAccountKeys.some((k) => k.toBase58() === "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4")) {
        return "Token swap (Jupiter)";
      }
    } catch {
      // Malformed bytes: fall through.
    }
  }
  return "Transaction";
}

function tone(status: Proposal["status"]): "ok" | "warn" | "danger" | "neutral" {
  if (status === "confirmed" || status === "auto_approved") return "ok";
  if (status === "awaiting_human") return "warn";
  if (status === "rejected" || status === "blocked" || status === "failed" || status === "expired") return "danger";
  return "neutral";
}

function Row({ p, onPress }: { p: Proposal; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T weight="semibold">{p.agentName ?? "Agent"}</T>
          <Badge label={p.status.replace("_", " ")} tone={tone(p.status)} />
        </View>
        <Mono size={14}>{summary(p)}</Mono>
        {p.blockReason && <T size={13} muted>{p.blockReason}</T>}
        <T size={12} muted>{new Date(p.createdAt).toLocaleString()}</T>
      </Card>
    </Pressable>
  );
}

function Chip({ label, count, selected, onPress }: { label: string; count?: number; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primary : "transparent" }}
    >
      <T size={13} weight="semibold" style={{ color: selected ? c.onPrimary : c.text }}>
        {label}
        {count !== undefined ? `  ${count}` : ""}
      </T>
    </Pressable>
  );
}

export function Inbox({ mode }: { mode: "approvals" | "activity" }) {
  const c = useColors();
  const { proposals, openProposal, error, ready } = useApp();
  const isActivity = mode === "activity";
  const [status, setStatus] = useState<StatusFilterKey>("all");
  const [agentId, setAgentId] = useState<string>();
  const agentsInFeed = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of proposals) if (!seen.has(p.agentId)) seen.set(p.agentId, p.agentName ?? "Agent");
    return [...seen];
  }, [proposals]);
  const counts = useMemo(() => countByFilter(proposals, agentId), [proposals, agentId]);
  const data = mode === "approvals" ? proposals.filter((p) => p.status === "awaiting_human") : filterActivity(proposals, status, agentId);
  const filtering = isActivity && (status !== "all" || !!agentId);
  const clear = () => {
    setStatus("all");
    setAgentId(undefined);
  };
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={data}
      keyExtractor={(p) => p.id}
      renderItem={({ item, index }) => (
        <View style={{ gap: 8 }}>
          {isActivity && (index === 0 || dayLabel(data[index - 1].createdAt) !== dayLabel(item.createdAt)) && (
            <T size={13} weight="semibold" muted style={{ marginTop: index === 0 ? 0 : 6 }}>{dayLabel(item.createdAt)}</T>
          )}
          <Row p={item} onPress={() => openProposal(item.id)} />
        </View>
      )}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Logo size={36} radius={10} />
            <T size={24} weight="bold">{mode === "approvals" ? "Needs your Nod" : "Activity"}</T>
          </View>
          {error && <T size={13} style={{ color: c.danger }}>Can't reach the backend: {error}</T>}
          {isActivity && proposals.length > 0 && (
            <View style={{ gap: 8 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {STATUS_FILTERS.filter((f) => f.key === "all" || f.key === status || counts[f.key] > 0).map((f) => (
                  <Chip key={f.key} label={f.label} count={counts[f.key]} selected={status === f.key} onPress={() => setStatus(f.key)} />
                ))}
              </ScrollView>
              {agentsInFeed.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  <Chip label="All agents" selected={!agentId} onPress={() => setAgentId(undefined)} />
                  {agentsInFeed.map(([id, name]) => (
                    <Chip key={id} label={name} selected={agentId === id} onPress={() => setAgentId(agentId === id ? undefined : id)} />
                  ))}
                </ScrollView>
              )}
              {filtering && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <T size={12} muted>Showing {data.length} of {proposals.length}</T>
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={clear}>
                    <T size={12} weight="semibold" style={{ color: c.accentText }}>Clear filters</T>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        ready ? (
          <T muted>
            {mode === "approvals" ? "Nothing waiting. Agents will show up here when they need you." : filtering ? "Nothing matches these filters." : "No activity yet."}
          </T>
        ) : null
      }
    />
  );
}
