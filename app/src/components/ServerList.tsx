import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { MAX_NAME, normalizeUrl, type SavedServer } from "../api/servers";
import { useColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { Badge, Button, Mono, T } from "./ui";

/** The saved servers: tap one to switch, rename it, or take it off the list. */
export function ServerList({
  servers,
  current,
  busy,
  onUse,
  onRename,
  onRemove,
}: {
  servers: SavedServer[];
  current: string;
  busy: boolean;
  onUse: (url: string) => void;
  onRename: (url: string, name: string) => void;
  onRemove: (url: string) => void;
}) {
  const c = useColors();
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState("");

  if (servers.length === 0) return <T size={13} muted>No servers saved yet.</T>;

  return (
    <View style={{ gap: 10 }}>
      {servers.map((s) => {
        const inUse = normalizeUrl(s.url) === normalizeUrl(current);
        const isEditing = editing === s.url;
        return (
          <View key={s.url} style={{ borderWidth: 1, borderRadius: 14, borderColor: inUse ? c.primary : c.border, padding: 12, gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={inUse ? `${s.name}, in use` : `Switch to ${s.name}`}
              disabled={inUse || busy || isEditing}
              onPress={() => onUse(s.url)}
              style={{ gap: 2 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <T weight="semibold" style={{ flexShrink: 1 }} numberOfLines={1}>{s.name}</T>
                {inUse && <Badge label="✓ In use" tone="ok" />}
              </View>
              <Mono size={12} color={c.muted} numberOfLines={1}>{s.url}</Mono>
            </Pressable>

            {isEditing ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  maxLength={MAX_NAME}
                  autoFocus
                  placeholder="A name you will recognise"
                  placeholderTextColor={c.muted}
                  style={{ fontFamily: fonts.jakarta.regular, fontSize: 15, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 10 }}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Save name"
                      onPress={() => {
                        onRename(s.url, draft);
                        setEditing(undefined);
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Cancel" kind="secondary" onPress={() => setEditing(undefined)} />
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: 16 }}>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    setDraft(s.name);
                    setEditing(s.url);
                  }}
                >
                  <T size={13} weight="semibold" style={{ color: c.accentText }}>Rename</T>
                </Pressable>
                {!inUse && (
                  <Pressable accessibilityRole="button" hitSlop={8} disabled={busy} onPress={() => onRemove(s.url)}>
                    <T size={13} weight="semibold" style={{ color: c.danger }}>Remove from list</T>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
