import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { inspectServer, parseServerUrl } from "../api/server";
import { Button, Card, T } from "../components/ui";
import { useApp } from "../state";
import { Logo } from "../components/Logo";
import { useColors } from "../theme/colors";
import { fonts } from "../theme/fonts";

/** First run: Nod has no central server, so the user says which backend to use. */
export function ConnectServer() {
  const c = useColors();
  const { changeServer } = useApp();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();

  const connect = async () => {
    setMessage(undefined);
    const parsed = parseServerUrl(input, { allowInsecure: __DEV__ });
    if (!parsed.ok) return setMessage(parsed.reason);
    setBusy(true);
    try {
      const check = await inspectServer(parsed.url);
      if (!check.ok) {
        setMessage(check.reason);
        return;
      }
      await changeServer(parsed.url);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 16, paddingTop: 48 }} keyboardShouldPersistTaps="handled">
      <Logo size={64} radius={16} />
      <T size={28} weight="bold">Welcome to Nod</T>
      <T muted>Nothing moves without your Nod. This app approves what your AI agents want to do with your money, one decoded card at a time.</T>

      <Card style={{ gap: 10 }}>
        <T weight="semibold">Connect to your Nod server</T>
        <T size={13} muted>
          Nod has no central server. You (or someone you trust) run the small Nod backend, and your agents and this phone both connect to it. The backend never holds your keys. See docs/DEPLOY.md in the Nod repository to run one in a few minutes.
        </T>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="https://nod.example.com"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={connect}
          style={{ fontFamily: fonts.mono.regular, fontSize: 14, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12 }}
        />
        {message && <T size={13} style={{ color: c.danger }}>{message}</T>}
        <Button title="Connect" onPress={connect} loading={busy} disabled={input.trim().length === 0} />
      </Card>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
