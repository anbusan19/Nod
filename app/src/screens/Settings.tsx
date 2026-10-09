import { useEffect, useRef, useState } from "react";
import { Linking, ScrollView, Switch, TextInput, View } from "react-native";
import { getServerUrl } from "../api/client";
import { inspectServer, parseServerUrl } from "../api/server";
import { fonts } from "../theme/fonts";
import { Button, Card, Checkbox, Mono, T } from "../components/ui";
import type { AuthPrefs } from "../security/authPlan";
import { availableSensors, confirmWithBiometrics, currentPlan, savePrefs } from "../security/biometric";
import { disablePush, enablePush, getPushStatus } from "../push/notifications";
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
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof currentPlan>>>();
  const [sensors, setSensors] = useState({ fingerprint: true, face: true });
  const refreshPush = () => getPushStatus().then(setPush).catch(() => setPush("off"));

  useEffect(() => {
    refreshPush();
  }, [server]);

  useEffect(() => {
    currentPlan().then(setPlan).catch(() => {});
    availableSensors().then(setSensors).catch(() => {});
  }, []);

  const changeMethod = async (key: keyof AuthPrefs, value: boolean) => {
    if (!plan) return;
    const next = { ...plan.prefs, [key]: value };
    if (!next.fingerprint && !next.face && !next.screenLock) {
      setMsg("Keep at least one way to confirm approvals.");
      return;
    }
    await savePrefs(next);
    setPlan(await currentPlan());
  };

  const togglePush = (on: boolean) =>
    run(async () => {
      if (on) {
        const r = await enablePush();
        await refreshPush();
        return r.ok ? "Push notifications are on." : `Could not turn push on: ${r.reason}`;
      }
      try {
        await disablePush();
      } catch (e) {
        await refreshPush();
        return `Could not turn push off: ${(e as Error).message}. It is still on.`;
      }
      await refreshPush();
      return "Push notifications are off. Requests from your agents still appear in the app.";
    });

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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T weight="semibold">Push notifications</T>
            <T size={13} muted>
              {push === "on"
                ? "On. You'll be alerted on the lock screen when an agent needs your approval."
                : push === "blocked"
                  ? "Blocked for Nod in Android. Allow notifications there to turn this on."
                  : "Off. Turn on to be alerted on the lock screen when an agent needs your approval."}
            </T>
          </View>
          <Switch
            accessibilityLabel="Push notifications"
            value={push === "on"}
            disabled={busy || push === undefined || push === "blocked"}
            onValueChange={togglePush}
            trackColor={{ false: c.border, true: c.primary }}
            thumbColor={push === "on" ? c.onPrimary : c.muted}
          />
        </View>
        {push === "blocked" && <Button title="Open Android settings" kind="secondary" onPress={() => Linking.openSettings()} />}
      </Card>

      <Card style={{ gap: 14 }}>
        <View style={{ gap: 2 }}>
          <T weight="semibold">Approval method</T>
          <T size={13} muted>How Nod confirms it's you before a payment is approved.</T>
        </View>
        <Checkbox
          label="Fingerprint"
          hint={sensors.fingerprint ? "The strongest option. Used once a fingerprint is set up in Android." : "This phone has no fingerprint sensor."}
          checked={!!plan?.prefs.fingerprint}
          disabled={!plan || !sensors.fingerprint}
          onChange={(v) => changeMethod("fingerprint", v)}
        />
        <Checkbox
          label="Face unlock"
          hint={sensors.face ? "Quicker, but weaker: a photo or a lookalike can fool some phones." : "This phone has no face unlock."}
          checked={!!plan?.prefs.face}
          disabled={!plan || !sensors.face}
          onChange={(v) => changeMethod("face", v)}
        />
        <Checkbox
          label="Screen lock"
          hint="PIN, pattern or password, as a backup if the above fail."
          checked={!!plan?.prefs.screenLock}
          disabled={!plan}
          onChange={(v) => changeMethod("screenLock", v)}
        />
        {plan && (
          <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 }}>
            <T size={13} muted>Approvals will use</T>
            <T>{plan.summary}</T>
            {plan.note ? <T size={13} muted>{plan.note}</T> : null}
            {plan.warning ? <T size={13} style={{ color: c.warn }}>{plan.warning}</T> : null}
          </View>
        )}
        <Button title="Try it" kind="secondary" disabled={busy} onPress={() => run(async () => {
            const r = await confirmWithBiometrics("Test: confirm it's you");
            return r.ok ? "Confirmed. Approvals will work this way." : `Not confirmed: ${r.reason}`;
          })} />
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
      </Card>

    </ScrollView>
  );
}
