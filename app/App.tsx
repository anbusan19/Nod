import "./src/polyfills";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, BackHandler, Pressable, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { T } from "./src/components/ui";
import { DialogHost } from "./src/components/Dialog";
import { onProposalOpened, registerForPush } from "./src/push/notifications";
import { About } from "./src/screens/About";
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

const TAB_ICONS: Record<Tab, React.ComponentProps<typeof Feather>["name"]> = {
  Approvals: "check-circle",
  Activity: "activity",
  Agents: "cpu",
  Settings: "settings",
};

function Shell() {
  const c = useColors();
  const { ready, needsServer, proposals, openProposalId, openProposal } = useApp();
  const [tab, setTab] = useState<Tab>("Approvals");
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    if (!ready || needsServer) return;
    registerForPush();
    return onProposalOpened(openProposal);
  }, [ready, needsServer, openProposal]);

  // The Android back button closes an open approval card instead of leaving the app.
  useEffect(() => {
    if (!openProposalId && !showAbout) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (openProposalId) openProposal(undefined);
      else setShowAbout(false);
      return true;
    });
    return () => sub.remove();
  }, [openProposalId, showAbout, openProposal]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>;
  }

  if (needsServer) return <ConnectServer />;

  const open = openProposalId ? proposals.find((p) => p.id === openProposalId) : undefined;
  if (open) return <ProposalCard key={open.id} proposal={open} onClose={() => openProposal(undefined)} />;
  if (showAbout) return <About onClose={() => setShowAbout(false)} />;

  const pending = proposals.filter((p) => p.status === "awaiting_human").length;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1 }}>
        {tab === "Approvals" && <Inbox mode="approvals" onNavigate={setTab} />}
        {tab === "Activity" && <Inbox mode="activity" />}
        {tab === "Agents" && <Agents />}
        {tab === "Settings" && <Settings onOpenAbout={() => setShowAbout(true)} />}
      </View>
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card }}>
        {TABS.map((t) => {
          const selected = tab === t;
          const count = t === "Approvals" ? pending : 0;
          return (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityLabel={count > 0 ? `${t}, ${count} waiting` : t}
              accessibilityState={{ selected }}
              onPress={() => setTab(t)}
              style={{ flex: 1, paddingTop: 8, paddingBottom: 10, alignItems: "center", gap: 3 }}
            >
              <View style={{ width: 58, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: selected ? `${c.primary}33` : "transparent" }}>
                <Feather name={TAB_ICONS[t]} size={21} color={selected ? c.accentText : c.muted} />
                {count > 0 && (
                  <View style={{ position: "absolute", top: -2, right: 4, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", backgroundColor: c.primary }}>
                    <T size={10} weight="bold" style={{ color: c.onPrimary }}>{count > 9 ? "9+" : String(count)}</T>
                  </View>
                )}
              </View>
              <T size={11} weight={selected ? "bold" : "regular"} style={{ color: selected ? c.accentText : c.muted }}>{t}</T>
            </Pressable>
          );
        })}
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
      <DialogHost />
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
