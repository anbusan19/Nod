import { FlatList, Pressable, View } from "react-native";
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

export function Inbox({ mode }: { mode: "approvals" | "activity" }) {
  const c = useColors();
  const { proposals, openProposal, error, ready } = useApp();
  const data = mode === "approvals" ? proposals.filter((p) => p.status === "awaiting_human") : proposals;
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      data={data}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <Row p={item} onPress={() => openProposal(item.id)} />}
      ListHeaderComponent={
        <View style={{ gap: 8, marginBottom: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Logo size={36} radius={10} />
            <T size={24} weight="bold">{mode === "approvals" ? "Needs your Nod" : "Activity"}</T>
          </View>
          {error && <T size={13} style={{ color: c.danger }}>Can't reach the backend: {error}</T>}
        </View>
      }
      ListEmptyComponent={
        ready ? (
          <T muted>{mode === "approvals" ? "Nothing waiting. Agents will show up here when they need you." : "No activity yet."}</T>
        ) : null
      }
    />
  );
}
