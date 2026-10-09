import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, Card, Mono, T } from "../components/ui";
import { biometricsAvailable } from "../security/biometric";
import { registerForPush } from "../push/notifications";
import { config } from "../config";
import { useApp } from "../state";
import { kv } from "../storage";
import { applyThemePref, useColors, type ThemePref } from "../theme/colors";

export function Settings() {
  const c = useColors();
  const { wallet, connect, disconnect } = useApp();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    kv.get("themePref").then((v) => v && setPref(v as ThemePref)).catch(() => {});
  }, []);

  const choose = (p: ThemePref) => {
    setPref(p);
    applyThemePref(p);
    kv.set("themePref", p).catch(() => {});
  };

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    try {
      setMsg((await fn()) ?? undefined);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <T size={24} weight="bold">Settings</T>

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
        <T weight="semibold">Notifications</T>
        <T size={13} muted>Needed to be alerted when an agent wants your approval.</T>
        <Button
          title="Enable push"
          kind="secondary"
          loading={busy}
          onPress={() => run(async () => {
            const r = await registerForPush();
            return r.ok ? "Push enabled." : `Push unavailable: ${r.reason}`;
          })}
        />
      </Card>

      <Card style={{ gap: 6 }}>
        <T weight="semibold">Device</T>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T size={13} muted>Cluster</T><Mono>{config.cluster}</Mono>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T size={13} muted>Backend</T><Mono>{config.apiUrl}</Mono>
        </View>
        <Button
          title="Check biometrics"
          kind="secondary"
          onPress={() => run(async () => ((await biometricsAvailable()) ? "Biometrics are ready." : "No fingerprint or face enrolled."))}
        />
      </Card>

      {msg && <T size={13} muted>{msg}</T>}
    </ScrollView>
  );
}
