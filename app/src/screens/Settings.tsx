import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Button, Card, Mono, T } from "../components/ui";
import { biometricsAvailable } from "../security/biometric";
import { registerForPush } from "../push/notifications";
import { config } from "../config";
import { useApp } from "../state";
import { useColors } from "../theme/colors";

export function Settings() {
  const c = useColors();
  const { wallet, connect, disconnect } = useApp();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);

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
