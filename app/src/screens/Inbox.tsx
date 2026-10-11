import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { STATUS_FILTERS, countByFilter, dayLabel, filterActivity, type StatusFilterKey } from "../activity/filter";
import { getServerUrl, type Proposal } from "../api/client";
import { Badge, Button, Card, Mono, T } from "../components/ui";
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

const STATUS_ICON: Record<Proposal["status"], React.ComponentProps<typeof Feather>["name"]> = {
  confirmed: "check",
  auto_approved: "check",
  approved: "check",
  submitted: "send",
  awaiting_human: "clock",
  rejected: "x",
  blocked: "slash",
  expired: "clock",
  failed: "alert-triangle",
};

const STATUS_LABEL: Record<Proposal["status"], string> = {
  confirmed: "Confirmed",
  auto_approved: "Auto-approved",
  approved: "Approved",
  submitted: "Submitted",
  awaiting_human: "Waiting",
  rejected: "Rejected",
  blocked: "Blocked",
  expired: "Expired",
  failed: "Failed",
};

/** One line of history: a status icon, what it was, who asked, and how it ended. */
function Row({ p, onPress }: { p: Proposal; onPress: () => void }) {
  const c = useColors();
  const t = tone(p.status);
  const fg = t === "ok" ? c.ok : t === "warn" ? c.warn : t === "danger" ? c.danger : c.muted;
  const bg = t === "ok" ? c.okBg : t === "warn" ? c.warnBg : t === "danger" ? c.dangerBg : c.border;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      <Card style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 14 }}>
        <View
          accessible
          accessibilityLabel={STATUS_LABEL[p.status] ?? p.status}
          style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center", marginTop: 2 }}
        >
          <Feather name={STATUS_ICON[p.status] ?? "circle"} size={19} color={fg} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <T size={13} muted numberOfLines={1} style={{ flexShrink: 1 }}>{p.agentName ?? "Agent"}</T>
            <T size={12} muted>{new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</T>
          </View>
          <T size={16} weight="semibold">{summary(p)}</T>
          {p.blockReason ? <T size={13} style={{ color: c.danger }}>{p.blockReason}</T> : p.reason ? <T size={13} muted numberOfLines={1}>“{p.reason}”</T> : null}
        </View>
      </Card>
    </Pressable>
  );
}

function EmptyActivity({ filtering }: { filtering: boolean }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", gap: 12, paddingTop: 36 }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
        <Feather name={filtering ? "filter" : "activity"} size={34} color={c.muted} />
      </View>
      <T size={18} weight="semibold">{filtering ? "Nothing matches" : "No activity yet"}</T>
      <T muted style={{ textAlign: "center" }}>
        {filtering ? "Try a different status or agent." : "Every request your agents make, and how it ended, will be listed here."}
      </T>
    </View>
  );
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

/** A request that is waiting for you: bigger, with an accent edge so it stands out from history. */
function ApprovalRow({ p, onPress }: { p: Proposal; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Review request from ${p.agentName ?? "agent"}`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      <Card style={{ gap: 10, borderLeftWidth: 4, borderLeftColor: c.warn }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
            <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: c.warnBg, alignItems: "center", justifyContent: "center" }}>
              <Feather name="cpu" size={15} color={c.warn} />
            </View>
            <T weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>{p.agentName ?? "Agent"}</T>
          </View>
          <T size={12} muted>{ago(p.createdAt)}</T>
        </View>
        <T size={20} weight="bold">{summary(p)}</T>
        {p.reason ? <T size={14} muted numberOfLines={2}>“{p.reason}”</T> : null}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
          <Badge label="Needs your Nod" tone="warn" />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <T size={14} weight="semibold" style={{ color: c.accentText }}>Review</T>
            <Feather name="chevron-right" size={18} color={c.accentText} />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

/** Nothing waiting: say it is fine, and show what Nod is doing so the screen is never a dead end. */
function AllClear({ server, agentCount, error, onRetry, onNavigate }: { server: string; agentCount: number; error?: string; onRetry: () => void; onNavigate: (tab: "Activity" | "Agents") => void }) {
  const c = useColors();
  const host = (() => {
    try {
      return new URL(server).host;
    } catch {
      return server || "no server";
    }
  })();
  return (
    <View style={{ alignItems: "center", gap: 18, paddingTop: 28 }}>
      <View style={{ width: 108, height: 108, borderRadius: 54, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
        <Logo size={64} radius={18} />
      </View>
      <View style={{ alignItems: "center", gap: 6 }}>
        <T size={22} weight="bold">{error ? "Can't reach your server" : "All clear"}</T>
        <T muted style={{ textAlign: "center" }}>
          {error
            ? "Nod could not load your requests. Check the server address in Settings, or try again."
            : agentCount === 0
              ? "No agents are paired yet. Pair one and its requests will show up here."
              : "Nothing is waiting for your Nod. When an agent proposes a transaction, it appears here and you get a notification."}
        </T>
      </View>

      <Card style={{ alignSelf: "stretch", gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <T size={13} muted>Server</T>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: error ? c.danger : c.ok }} />
            <Mono size={13} style={{ flexShrink: 1 }}>{host}</Mono>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <T size={13} muted>Agents paired</T>
          <Mono size={13}>{agentCount}</Mono>
        </View>
      </Card>

      <View style={{ alignSelf: "stretch", gap: 10 }}>
        {error ? <Button title="Try again" onPress={onRetry} /> : null}
        {!error && agentCount === 0 ? <Button title="Pair your first agent" onPress={() => onNavigate("Agents")} /> : null}
        {!error && agentCount > 0 ? <Button title="See activity" kind="secondary" onPress={() => onNavigate("Activity")} /> : null}
      </View>
    </View>
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

export function Inbox({ mode, onNavigate }: { mode: "approvals" | "activity"; onNavigate?: (tab: "Activity" | "Agents") => void }) {
  const c = useColors();
  const { proposals, openProposal, error, ready, agents, refresh } = useApp();
  const [server, setServer] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    getServerUrl().then(setServer).catch(() => {});
  }, [proposals.length, error]);
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
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await refresh().catch(() => {});
        setRefreshing(false);
      }}
      keyExtractor={(p) => p.id}
      renderItem={({ item, index }) => (
        <View style={{ gap: 8 }}>
          {isActivity && (index === 0 || dayLabel(data[index - 1].createdAt) !== dayLabel(item.createdAt)) && (
            <T size={13} weight="semibold" muted style={{ marginTop: index === 0 ? 0 : 6 }}>{dayLabel(item.createdAt)}</T>
          )}
          {mode === "approvals" ? <ApprovalRow p={item} onPress={() => openProposal(item.id)} /> : <Row p={item} onPress={() => openProposal(item.id)} />}
        </View>
      )}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Logo size={36} radius={10} />
            <View style={{ flex: 1 }}>
              <T size={24} weight="bold">{mode === "approvals" ? "Needs your Nod" : "Activity"}</T>
              {mode === "approvals" && data.length > 0 ? <T size={13} muted>{data.length === 1 ? "1 request is waiting" : `${data.length} requests are waiting`}</T> : null}
              {isActivity && proposals.length > 0 ? <T size={13} muted>{`${proposals.length} request${proposals.length === 1 ? "" : "s"} so far`}</T> : null}
            </View>
          </View>
          {error && data.length > 0 && <T size={13} style={{ color: c.danger }}>Can't reach the backend: {error}</T>}
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
          mode === "approvals" ? (
            <AllClear server={server} agentCount={agents.length} error={error} onRetry={() => refresh()} onNavigate={(t) => onNavigate?.(t)} />
          ) : (
            <EmptyActivity filtering={filtering} />
          )
        ) : null
      }
    />
  );
}
