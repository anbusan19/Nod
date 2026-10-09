import { Feather } from "@expo/vector-icons";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { getServerUrl } from "../api/client";
import { SUPPORTED_API_VERSION } from "../api/server";
import { loadServers, normalizeUrl } from "../api/servers";
import { Card, Mono, T } from "../components/ui";
import { config } from "../config";
import { kv } from "../storage";
import { Logo } from "../components/Logo";
import { useColors } from "../theme/colors";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 16 }}>
      <T size={13} muted>{label}</T>
      <Mono size={13} style={{ flexShrink: 1, textAlign: "right" }}>{value}</Mono>
    </View>
  );
}

/** What Nod is, which build this is, and what it is connected to. */
export function About({ onClose }: { onClose: () => void }) {
  const c = useColors();
  const [server, setServer] = useState("");

  useEffect(() => {
    (async () => {
      const url = await getServerUrl();
      const saved = (await loadServers(kv)).find((s) => normalizeUrl(s.url) === normalizeUrl(url));
      setServer(saved ? `${saved.name} · ${url}` : url);
    })().catch(() => {});
  }, []);

  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "unknown";
  const build = Application.nativeBuildVersion;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Settings" hitSlop={10} onPress={onClose} style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
          <Feather name="chevron-left" size={26} color={c.text} />
        </Pressable>
        <T size={20} weight="bold">About</T>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 12 }}>
          <Logo size={120} radius={28} />
          <T size={28} weight="bold">Nod</T>
          <T muted style={{ textAlign: "center" }}>Nothing moves without your Nod.</T>
        </View>

        <Card style={{ gap: 8 }}>
          <T weight="semibold">What it does</T>
          <T size={14} muted>
            Your AI agents propose Solana transactions. Nod decodes what each one really does, simulates the balance changes, checks it against what the agent claimed, and asks you to confirm. Your wallet app signs, so your keys never enter Nod or its server.
          </T>
        </Card>

        <Card style={{ gap: 10 }}>
          <T weight="semibold">This app</T>
          <Row label="Version" value={build ? `${version} (${build})` : version} />
          <Row label="Network" value={config.cluster === "mainnet-beta" ? "mainnet" : config.cluster} />
          <Row label="API version" value={`v${SUPPORTED_API_VERSION}`} />
          <Row label="Package" value={Application.applicationId ?? "app.nod.mobile"} />
          <Row label="Server" value={server || "not set"} />
        </Card>

        <Card style={{ gap: 6 }}>
          <T weight="semibold">Good to know</T>
          <T size={14} muted>Nod is prototype software and has not been independently audited. Use test funds.</T>
          <T size={14} muted>Released under the MIT licence.</T>
        </Card>
      </ScrollView>
    </View>
  );
}
