import { useEffect, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Alert, Linking, Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { getServerUrl } from "../api/client";
import { inspectServer, parseServerUrl } from "../api/server";
import { addServer, loadServers, markChecked, normalizeUrl, removeServer, renameServer, sortServers, upsertServer, type SavedServer } from "../api/servers";
import { fonts } from "../theme/fonts";
import { ServerList } from "../components/ServerList";
import { ThemeSwitch } from "../components/ThemeSwitch";
import { Button, Card, Checkbox, Mono, T } from "../components/ui";
import type { AuthPrefs } from "../security/authPlan";
import { availableSensors, confirmWithBiometrics, currentPlan, savePrefs } from "../security/biometric";
import { disablePush, enablePush, getPushStatus } from "../push/notifications";
import type { PushStatus } from "../push/status";
import { config } from "../config";
import { useApp } from "../state";
import { kv } from "../storage";
import { applyThemePref, useColors, type ThemePref } from "../theme/colors";

export function Settings({ onOpenAbout }: { onOpenAbout: () => void }) {
  const c = useColors();
  const { wallet, connect, disconnect, changeServer } = useApp();
  const [server, setServer] = useState("");
  const [serverInput, setServerInput] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [serverMsg, setServerMsg] = useState<string>();
  const [serverBusy, setServerBusy] = useState(false);
  const [testing, setTesting] = useState<string>();
  const [servers, setServers] = useState<SavedServer[]>([]);
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
    (async () => {
      const u = await getServerUrl();
      setServer(u);
      if (u) {
        // The server in use is always on the list. Add it once; never overwrite a name the user gave it.
        const known = (await loadServers(kv)).some((x) => normalizeUrl(x.url) === normalizeUrl(u));
        if (!known) await upsertServer(kv, u, { name: normalizeUrl(u) === normalizeUrl(config.apiUrl) ? "Built-in server" : undefined });
      }
      setServers(sortServers(await loadServers(kv), u));
    })().catch(() => {});
  }, []);

  useEffect(() => {
    kv.get("themePref").then((v) => v && setPref(v as ThemePref)).catch(() => {});
  }, []);

  const reloadServers = async () => setServers(sortServers(await loadServers(kv), await getServerUrl()));

  /** Server actions report inside the Servers card, so the page does not jump to the top. */
  const runServer = async (fn: () => Promise<string | void>) => {
    setServerBusy(true);
    setServerMsg(undefined);
    try {
      setServerMsg((await fn()) ?? undefined);
    } catch (e) {
      setServerMsg((e as Error).message);
    }
    setServerBusy(false);
  };

  const nameOf = async (url: string) => (await loadServers(kv)).find((x) => normalizeUrl(x.url) === normalizeUrl(url))?.name ?? url;

  /** Switch backends, but only to one that answers like a Nod backend. A server that answers counts as verified. */
  const switchTo = (url: string) =>
    runServer(async () => {
      const check = await inspectServer(url);
      if (!check.ok) return `${check.reason} Nothing was changed.`;
      await upsertServer(kv, url);
      await markChecked(kv, url);
      await changeServer(url);
      setServer(await getServerUrl());
      await reloadServers();
      return `Now using ${await nameOf(url)}.`;
    });

  /** Add to the list only. It does not switch, and it does not test: that is the Test connection button. */
  const addNew = () =>
    runServer(async () => {
      const parsed = parseServerUrl(serverInput, { allowInsecure: __DEV__ });
      if (!parsed.ok) return parsed.reason;
      const r = await addServer(kv, parsed.url, newName || undefined);
      await reloadServers();
      if (!r.added) return "That server is already in your list.";
      setServerInput("");
      setNewName("");
      setAdding(false);
      return `Added ${await nameOf(parsed.url)}. Use Test connection to check it, or tap it to switch.`;
    });

  const testServer = (url: string) => {
    setTesting(url);
    return runServer(async () => {
      const check = await inspectServer(url);
      if (!check.ok) return `${await nameOf(url)}: ${check.reason}`;
      await markChecked(kv, url);
      await reloadServers();
      return `${await nameOf(url)} is reachable (Nod API v${check.apiVersion}${check.cluster ? `, ${check.cluster}` : ""}).`;
    }).finally(() => setTesting(undefined));
  };

  const renameSaved = async (url: string, name: string) => {
    setServerMsg(undefined);
    await renameServer(kv, url, name);
    await reloadServers();
  };

  const removeSaved = (url: string) => {
    const inUse = normalizeUrl(url) === normalizeUrl(server);
    const other = servers.find((x) => normalizeUrl(x.url) !== normalizeUrl(url));
    if (inUse && !other) {
      Alert.alert("This is your only server", "Nod needs a server to work. Add another one with the + button first, then you can delete this one.");
      return;
    }
    Alert.alert(
      "Delete this server?",
      inUse
        ? `It is only removed from your list; this phone keeps its registration there, so adding it again brings your paired agents back. You will be switched to ${other!.name} first.`
        : "It is only removed from your list. This phone keeps its registration there, so adding the server again brings your paired agents back.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            runServer(async () => {
              if (inUse) {
                const check = await inspectServer(other!.url);
                if (!check.ok) return `Could not switch to ${other!.name}: ${check.reason} Nothing was deleted.`;
                await upsertServer(kv, other!.url);
                await markChecked(kv, other!.url);
                await changeServer(other!.url);
                setServer(await getServerUrl());
              }
              await removeServer(kv, url);
              await reloadServers();
              return inUse ? `Deleted. Now using ${other!.name}.` : undefined;
            }),
        },
      ],
    );
  };

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

      <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
        <T weight="semibold">Appearance</T>
        <ThemeSwitch value={pref} onChange={choose} />
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

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T weight="semibold">Servers</T>
            <T size={13} muted>The Nod backends this phone knows. Tap one to switch. Agents are paired with one server, so after switching you see only the agents paired there; switching back brings the old ones back.</T>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={adding ? "Close the add server form" : "Add a server"}
            hitSlop={8}
            onPress={() => setAdding((v) => !v)}
            style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: adding ? c.border : c.primary }}
          >
            <Feather name={adding ? "x" : "plus"} size={20} color={adding ? c.text : c.onPrimary} />
          </Pressable>
        </View>

        {serverMsg ? (
          <View style={{ borderWidth: 1, borderColor: c.accentText, borderRadius: 12, padding: 10 }}>
            <T size={13}>{serverMsg}</T>
          </View>
        ) : null}

        {adding && (
          <View style={{ gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 14, padding: 12 }}>
            <T size={13} weight="semibold">Add a server</T>
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
            <TextInput
              value={newName}
              onChangeText={setNewName}
              maxLength={40}
              placeholder="Name (optional), such as Home Mac"
              placeholderTextColor={c.muted}
              style={{ fontFamily: fonts.jakarta.regular, fontSize: 15, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12 }}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button title="Add" loading={serverBusy} disabled={serverInput.trim().length === 0} onPress={addNew} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" kind="secondary" disabled={serverBusy} onPress={() => setAdding(false)} />
              </View>
            </View>
          </View>
        )}

        <ServerList servers={servers} current={server} busy={serverBusy} testing={testing} onUse={switchTo} onRename={renameSaved} onRemove={removeSaved} onTest={testServer} />
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


      <Pressable
        accessibilityRole="button"
        accessibilityLabel="About Nod"
        onPress={onOpenAbout}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 }}>
          <Feather name="info" size={20} color={c.accentText} />
          <T weight="semibold" style={{ flex: 1 }}>About Nod</T>
          <Feather name="chevron-right" size={20} color={c.muted} />
        </Card>
      </Pressable>
    </ScrollView>
  );
}
