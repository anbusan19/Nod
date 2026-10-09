import { useEffect, useRef, useState } from "react";
import { TextInput } from "react-native";
import { ScrollView, View } from "react-native";
import { getServerUrl } from "../api/client";
import { inspectServer, parseServerUrl } from "../api/server";
import { fonts } from "../theme/fonts";
import { Badge, Button, Card, Mono, T } from "../components/ui";
import { getAuthMethod } from "../security/biometric";
import { Linking } from "react-native";
import { getPushStatus, registerForPush } from "../push/notifications";
import type { PushStatus } from "../push/status";
import { config } from "../config";
import { useApp } from "../state";
import { kv } from "../storage";
import { applyThemePref, useColors, type ThemePref } from "../theme/colors";

export function Settings() {
  const c = useColors();
  const { wallet, connect, disconnect, changeServer } = useApp();
  const [server, setServer] = useState("");
  const [serverInput, setServerInput] = useState("");
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [pref, setPref] = useState<ThemePref>("system");
  const scroller = useRef<ScrollView>(null);
  const [push, setPush] = useState<PushStatus | undefined>();
  const refreshPush = () => getPushStatus().then(setPush).catch(() => setPush("off"));

  useEffect(() => {
    refreshPush();
  }, [server]);

  useEffect(() => {
    getServerUrl().then((u) => { setServer(u); setServerInput(u); }).catch(() => {});
  }, []);

  useEffect(() => {
    kv.get("themePref").then((v) => v && setPref(v as ThemePref)).catch(() => {});
  }, []);

  /** Switch backends, but only to one that answers like a Nod backend. */
  const saveServer = (reset: boolean) =>
    run(async () => {
      let url: string | undefined;
      if (!reset) {
        const parsed = parseServerUrl(serverInput, { allowInsecure: __DEV__ });
        if (!parsed.ok) return parsed.reason;
        const check = await inspectServer(parsed.url);
        if (!check.ok) return `${check.reason} Nothing was changed.`;
        url = parsed.url;
      }
      await changeServer(url);
      const now = await getServerUrl();
      setServer(now);
      setServerInput(now);
      return reset ? "Back to the built-in server." : `Now using ${now}.`;
    });

  const choose = (p: ThemePref) => {
    setPref(p);
    applyThemePref(p);
    kv.set("themePref", p).catch(() => {});
  };

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(undefined);
    try {
      setMsg((await fn()) ?? "Done.");
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
    // Feedback lives at the top of the screen, so bring it into view.
    scroller.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <T size={24} weight="bold">Settings</T>
      {msg && (
        <Card style={{ borderColor: c.accentText }}>
          <T size={14}>{msg}</T>
        </Card>
      )}

      <Card style={{ gap: 10 }}>
        <T weight="semibold">Wallet</T>
        {wallet ? <Mono selectable>{wallet}</Mono> : <T muted>No wallet connected. Nod signs through Mobile Wallet Adapter; keys never enter this app.</T>}
        {wallet ? (
          <Button title="Disconnect" kind="secondary" loading={busy} onPress={() => run(disconnect)} />
        ) : (
          <Button title="Connect wallet" loading={busy} onPress={() => run(connect)} />
        )}
      </Card>

      <Card style={{ gap: 10 }}>
        <T weight="semibold">Appearance</T>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["system", "light", "dark"] as const).map((p) => (
            <View key={p} style={{ flex: 1 }}>
              <Button title={p[0].toUpperCase() + p.slice(1)} kind={pref === p ? "primary" : "secondary"} onPress={() => choose(p)} />
            </View>
          ))}
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <T weight="semibold">Notifications</T>
          {push === "on" && <Badge label="✓ On" tone="ok" />}
        </View>
        {push === "on" ? (
          <T size={13} muted>You'll be alerted on the lock screen when an agent needs your approval.</T>
        ) : push === "blocked" ? (
          <>
            <T size={13} muted>Notifications are blocked for Nod in Android. Allow them to be alerted when an agent needs your approval.</T>
            <Button title="Open Android settings" kind="secondary" onPress={() => Linking.openSettings()} />
          </>
        ) : (
          <>
            <T size={13} muted>Needed to be alerted when an agent wants your approval.</T>
            <Button
              title="Enable push"
              kind="secondary"
              loading={busy}
              onPress={() =>
                run(async () => {
                  const r = await registerForPush();
                  await refreshPush();
                  return r.ok ? "Push enabled." : `Push unavailable: ${r.reason}`;
                })
              }
            />
          </>
        )}
      </Card>

      <Card style={{ gap: 10 }}>
        <T weight="semibold">Server</T>
        <T size={13} muted>The Nod backend this app talks to. Agents pair with it, and it forwards their proposals to this phone. Agents are paired with one server, so after switching you see only the agents paired there. Switching back brings the old ones back.</T>
        <TextInput
          value={serverInput}
          onChangeText={setServerInput}
          placeholder="https://nod.example.com"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={{ fontFamily: fonts.mono.regular, fontSize: 13, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12 }}
        />
        <Button title="Use this server" kind="secondary" loading={busy} disabled={serverInput.trim() === server} onPress={() => saveServer(false)} />
        {config.apiUrl ? <Button title="Reset to built-in server" kind="secondary" disabled={busy} onPress={() => saveServer(true)} /> : null}
      </Card>

      <Card style={{ gap: 6 }}>
        <T weight="semibold">Device</T>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T size={13} muted>Cluster</T><Mono>{config.cluster}</Mono>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T size={13} muted>Backend</T><Mono style={{ flexShrink: 1, textAlign: "right" }}>{server || config.apiUrl}</Mono>
        </View>
        <Button
          title="Check approval method"
          kind="secondary"
          onPress={() =>
            run(async () => {
              const m = await getAuthMethod();
              if (m === "biometric") return "Approvals will use your fingerprint or face.";
              if (m === "screen-lock") return "No biometrics enrolled. Approvals will ask for your screen lock (PIN, pattern or password).";
              return "No screen lock set. Set one up in Android settings to approve transactions.";
            })
          }
        />
      </Card>

    </ScrollView>
  );
}
