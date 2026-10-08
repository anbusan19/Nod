import "./src/polyfills";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { T } from "./src/components/ui";
import { onProposalOpened, registerForPush } from "./src/push/notifications";
import { Agents } from "./src/screens/Agents";
import { Inbox } from "./src/screens/Inbox";
import { ProposalCard } from "./src/screens/ProposalCard";
import { Settings } from "./src/screens/Settings";
import { AppProvider, useApp } from "./src/state";
import { useColors } from "./src/theme/colors";
import { fontAssets } from "./src/theme/fonts";

const TABS = ["Approvals", "Activity", "Agents", "Settings"] as const;
type Tab = (typeof TABS)[number];

function Shell() {
  const c = useColors();
  const { ready, proposals, openProposalId, openProposal } = useApp();
  const [tab, setTab] = useState<Tab>("Approvals");

  useEffect(() => {
    if (!ready) return;
    registerForPush();
    return onProposalOpened(openProposal);
  }, [ready, openProposal]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>;
  }

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
            <T size={13} weight={tab === t ? "bold" : "regular"} style={{ color: tab === t ? c.primary : c.muted }}>
              {t}{t === "Approvals" && pending > 0 ? ` (${pending})` : ""}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  const [loaded] = useFonts(fontAssets);
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <SafeAreaView style={{ flex: 1 }}>
          <Shell />
        </SafeAreaView>
        <StatusBar style="auto" />
      </AppProvider>
    </SafeAreaProvider>
  );
}
