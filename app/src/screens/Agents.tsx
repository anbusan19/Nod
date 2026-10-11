import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { api, getServerUrl, type Agent, type Policy } from "../api/client";
import { Feather } from "@expo/vector-icons";
import { Badge, Button, Card, Mono, T } from "../components/ui";
import { Logo } from "../components/Logo";
import { useApp } from "../state";
import { fonts } from "../theme/fonts";
import { useColors } from "../theme/colors";

const LAMPORTS = 1_000_000_000;
const toSol = (l: number) => String(l / LAMPORTS);
const toLamports = (s: string) => Math.round(Number(s) * LAMPORTS);

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={{ gap: 4 }}>
      <T size={13} muted>{label}</T>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        style={{ fontFamily: fonts.mono.regular, fontSize: 16, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12 }}
      />
    </View>
  );
}

const fmtSol = (l: number) => `${Number((l / LAMPORTS).toFixed(4))}`;

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, gap: 1 }}>
      <T size={11} muted>{label}</T>
      <Mono size={14} medium>{value}</Mono>
    </View>
  );
}

function Section({ title, hint }: { title: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 2, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border }}>
      <T size={12} weight="semibold" muted style={{ letterSpacing: 0.6 }}>{title.toUpperCase()}</T>
      {hint ? <T size={12} muted>{hint}</T> : null}
    </View>
  );
}

function AgentCard({ agent, open, onToggle }: { agent: Agent; open: boolean; onToggle: () => void }) {
  const { refresh, proposals } = useApp();
  const c = useColors();
  const p = agent.policy;
  const mine = proposals.filter((x) => x.agentId === agent.id);
  const waiting = mine.filter((x) => x.status === "awaiting_human").length;
  const last = mine.reduce((m, x) => Math.max(m, x.createdAt), 0);
  const [auto, setAuto] = useState(p ? toSol(p.autoLimitLamports) : "0");
  const [hard, setHard] = useState(p ? toSol(p.hardCapLamports) : "0");
  const [daily, setDaily] = useState(p ? toSol(p.dailyCapLamports) : "0");
  const [recipient, setRecipient] = useState("");
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState<string>();

  const confirm = (title: string, message: string, action: string, onYes: () => void) =>
    Alert.alert(title, message, [{ text: "Cancel", style: "cancel" }, { text: action, style: "destructive", onPress: onYes }]);

  const rotate = () =>
    confirm("Make a new key?", `The key ${agent.name} uses now stops working immediately. You will have to give it the new key.`, "Make new key", async () => {
      try {
        setNewKey((await api.rotateKey(agent.id)).apiKey);
      } catch (e) {
        Alert.alert("Could not rotate", (e as Error).message);
      }
    });

  const remove = () =>
    confirm("Remove this agent?", `${agent.name} stops working immediately and anything it still has waiting is cancelled. Its past activity stays in your feed.`, "Remove", async () => {
      try {
        await api.removeAgent(agent.id);
        await refresh();
      } catch (e) {
        Alert.alert("Could not remove", (e as Error).message);
      }
    });

  const save = async (patch: Partial<Policy> = {}) => {
    if (!p) return;
    const next: Policy = {
      ...p,
      autoLimitLamports: toLamports(auto),
      hardCapLamports: toLamports(hard),
      dailyCapLamports: toLamports(daily),
      ...patch,
    };
    if ([next.autoLimitLamports, next.hardCapLamports, next.dailyCapLamports].some((n) => !Number.isFinite(n) || n < 0)) {
      Alert.alert("Invalid limits", "Limits must be positive numbers of SOL.");
      return;
    }
    setSaving(true);
    try {
      await api.setPolicy(agent.id, next);
      await refresh();
    } catch (e) {
      Alert.alert("Could not save", (e as Error).message);
    }
    setSaving(false);
  };

  const toggleFreeze = async (frozen: boolean) => {
    Haptics.notificationAsync(frozen ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success).catch(() => {});
    await api.setFrozen(agent.id, frozen).catch((e) => Alert.alert("Failed", e.message));
    refresh();
  };

  return (
    <Card style={{ gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${agent.name}, ${open ? "collapse" : "expand"} settings`}
        onPress={onToggle}
        style={{ gap: 12 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: agent.frozen ? c.dangerBg : c.okBg, alignItems: "center", justifyContent: "center" }}>
            <Feather name={agent.frozen ? "pause" : "cpu"} size={21} color={agent.frozen ? c.danger : c.ok} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <T size={18} weight="semibold" numberOfLines={1}>{agent.name}</T>
            <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
              <Badge label={agent.frozen ? "Frozen" : "Active"} tone={agent.frozen ? "danger" : "ok"} />
              {waiting > 0 ? <Badge label={`${waiting} waiting`} tone="warn" /> : null}
            </View>
          </View>
          <Feather name={open ? "chevron-up" : "chevron-down"} size={22} color={c.muted} />
        </View>
        {p && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Stat label="Auto up to" value={`${fmtSol(p.autoLimitLamports)} SOL`} />
            <Stat label="Max per tx" value={`${fmtSol(p.hardCapLamports)} SOL`} />
            <Stat label="Daily cap" value={`${fmtSol(p.dailyCapLamports)} SOL`} />
          </View>
        )}
        <T size={12} muted>
          {mine.length === 0 ? "No proposals yet" : `${mine.length} proposal${mine.length === 1 ? "" : "s"}${last ? ` · last ${new Date(last).toLocaleDateString()}` : ""}`}
        </T>
      </Pressable>
      {open && (
        <>
      <Section title="Status" />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T size={13} style={{ color: agent.frozen ? c.danger : c.muted, flexShrink: 1 }}>{agent.frozen ? "Frozen: every proposal is blocked" : "Freeze this agent"}</T>
        <Switch value={agent.frozen} onValueChange={toggleFreeze} />
      </View>
      <Section title="Limits" hint="Under the auto limit it goes through. Above it, you decide. Above the max, it is blocked." />
      <Field label="Auto-approve up to (SOL)" value={auto} onChange={setAuto} />
      <Field label="Hard cap per transaction (SOL)" value={hard} onChange={setHard} />
      <Field label="Daily cap (SOL)" value={daily} onChange={setDaily} />
      <Button title="Save limits" kind="secondary" loading={saving} onPress={() => save()} />

      <Section title="Allowed recipients" hint={p?.allowedRecipients.length ? undefined : "None yet. Anyone can be a recipient, with a new-recipient warning."} />
      {p?.allowedRecipients.map((r) => (
        <View key={r} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Mono selectable>{r.slice(0, 8)}…{r.slice(-6)}</Mono>
          <Button title="Remove" kind="secondary" onPress={() => save({ allowedRecipients: p.allowedRecipients.filter((x) => x !== r) })} />
        </View>
      ))}
      <TextInput
        value={recipient}
        onChangeText={setRecipient}
        placeholder="Paste a wallet address"
        placeholderTextColor={c.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={{ fontFamily: fonts.mono.regular, fontSize: 13, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12 }}
      />
      <Button
        title="Add recipient"
        kind="secondary"
        disabled={recipient.trim().length < 32}
        onPress={() => {
          const r = recipient.trim();
          setRecipient("");
          save({ allowedRecipients: [...new Set([...(p?.allowedRecipients ?? []), r])] });
        }}
      />

      {newKey && (
        <View style={{ gap: 6, borderWidth: 1, borderColor: c.accentText, borderRadius: 12, padding: 12 }}>
          <T size={13} weight="semibold">New key. Shown only now.</T>
          <Mono selectable size={12}>{newKey}</Mono>
          <T size={12} muted>Copy it into the agent's NOD_AGENT_KEY. Press and hold the key to select and copy.</T>
          <Button title="I have saved it" kind="secondary" onPress={() => setNewKey(undefined)} />
        </View>
      )}

      <Section title="Key and access" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}><Button title="New key" kind="secondary" onPress={rotate} /></View>
        <View style={{ flex: 1 }}><Button title="Remove agent" kind="danger" onPress={remove} /></View>
      </View>
        </>
      )}
    </Card>
  );
}

export function Agents() {
  const c = useColors();
  const { agents } = useApp();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number }>();
  const [error, setError] = useState<string>();
  const [server, setServer] = useState("");
  useEffect(() => {
    getServerUrl().then(setServer).catch(() => {});
  }, []);

  const pair = async () => {
    try {
      setError(undefined);
      setPairing(await api.createPairing());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Logo size={36} radius={10} />
        <View style={{ flex: 1 }}>
          <T size={24} weight="bold">Agents</T>
          <T size={13} muted>{agents.length === 0 ? "None paired yet" : `${agents.length} paired`}</T>
        </View>
      </View>

      <Card style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <T weight="semibold">Pair a new agent</T>
          <T size={13} muted>Get a one-time code, then give it to your agent. Its key is shown once, to the agent only.</T>
        </View>
        {pairing ? (
          <View style={{ gap: 8 }}>
            <View style={{ borderWidth: 1, borderColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" }}>
              <Mono size={30} medium selectable>{pairing.code}</Mono>
              <T size={12} muted>Expires in 5 minutes</T>
            </View>
            <T size={12} muted>Run where your agent lives:</T>
            <View style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 10 }}>
              <Mono size={12} selectable>{`npx nod-sdk pair ${pairing.code} --api ${server || "<your server>"}`}</Mono>
            </View>
          </View>
        ) : null}
        {error && <T size={13} style={{ color: c.danger }}>{error}</T>}
        <Button title={pairing ? "New code" : "Show pairing code"} onPress={pair} />
      </Card>

      {agents.length === 0 ? (
        <View style={{ alignItems: "center", gap: 10, paddingTop: 20 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}>
            <Feather name="cpu" size={34} color={c.muted} />
          </View>
          <T size={18} weight="semibold">No agents yet</T>
          <T muted style={{ textAlign: "center" }}>Pair one above and set how much it may spend on its own. Anything over that waits for your Nod.</T>
        </View>
      ) : (
        agents.length > 1 && <T size={13} muted>Tap an agent to change its limits, freeze it or remove it.</T>
      )}
      {agents.map((a) => (
        <AgentCard
          key={a.id + (a.policy ? JSON.stringify(a.policy) : "")}
          agent={a}
          open={expanded[a.id] ?? agents.length === 1}
          onToggle={() => setExpanded((e) => ({ ...e, [a.id]: !(e[a.id] ?? agents.length === 1) }))}
        />
      ))}
    </ScrollView>
  );
}
