import "./src/polyfills";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, Pressable, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { T } from "./src/components/ui";
import { onProposalOpened, registerForPush } from "./src/push/notifications";
import { Agents } from "./src/screens/Agents";
import { ConnectServer } from "./src/screens/ConnectServer";
import { Inbox } from "./src/screens/Inbox";
import { ProposalCard } from "./src/screens/ProposalCard";
import { Settings } from "./src/screens/Settings";
import { AppProvider, useApp } from "./src/state";
import { applyThemePref, useColors, useIsDark, type ThemePref } from "./src/theme/colors";
import { kv } from "./src/storage";
import { fontAssets } from "./src/theme/fonts";

const TABS = ["Approvals", "Activity", "Agents", "Settings"] as const;
type Tab = (typeof TABS)[number];

function Shell() {
  const c = useColors();
  const { ready, needsServer, proposals, openProposalId, openProposal } = useApp();
  const [tab, setTab] = useState<Tab>("Approvals");

  useEffect(() => {
    if (!ready || needsServer) return;
    registerForPush();
    return onProposalOpened(openProposal);
  }, [ready, needsServer, openProposal]);

  // The Android back button closes an open approval card instead of leaving the app.
  useEffect(() => {
    if (!openProposalId) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      openProposal(undefined);
      return true;
    });
    return () => sub.remove();
  }, [openProposalId, openProposal]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>;
  }

  if (needsServer) return <ConnectServer />;

  const open = openProposalId ? proposals.find((p) => p.id === openProposalId) : undefined;
  if (open) return <ProposalCard key={open.id} proposal={open} onClose={() => openProposal(undefined)} />;

  const pending = proposals.filter((p) => p.status === "awaiting_human").length;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1 }}>
        {tab === "Approvals" && <Inbox mode="approvals" />}
        {tab === "Activity" && <Inbox mode="activity" />}
        {tab === "Agents" && <Agents />}
        {tab === "Settings" && <Settings />}
      </View>
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card }}>
        {TABS.map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={{ flex: 1, paddingVertical: 14, alignItems: "center" }}>
            <T size={13} weight={tab === t ? "bold" : "regular"} style={{ color: tab === t ? c.accentText : c.muted }}>
              {t}{t === "Approvals" && pending > 0 ? ` (${pending})` : ""}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Frame() {
  const c = useColors();
  const dark = useIsDark();
  return (
    <>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <Shell />
      </SafeAreaView>
      <StatusBar style={dark ? "light" : "dark"} />
    </>
  );
}

export default function App() {
  const [loaded] = useFonts(fontAssets);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    kv.get("themePref")
      .then((v) => applyThemePref(v === "light" || v === "dark" ? (v as ThemePref) : "system"))
      .catch(() => {})
      .finally(() => setThemeReady(true));
  }, []);

  if (!loaded || !themeReady) return null;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Frame />
      </AppProvider>
    </SafeAreaProvider>
  );
}
