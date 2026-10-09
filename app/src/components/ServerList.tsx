import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { MAX_NAME, normalizeUrl, type SavedServer } from "../api/servers";
import { useColors } from "../theme/colors";
import { fonts } from "../theme/fonts";
import { Badge, Button, Mono, T } from "./ui";

/**
 * The saved servers. Tap a row to switch to it. Each row has an edit (pencil) button that opens Rename and Delete, and a
 * Test connection button until the server has been verified.
 */
export function ServerList({
  servers,
  current,
  busy,
  testing,
  onUse,
  onRename,
  onRemove,
  onTest,
}: {
  servers: SavedServer[];
  current: string;
  busy: boolean;
  /** The address being tested right now, if any. */
  testing?: string;
  onUse: (url: string) => void;
  onRename: (url: string, name: string) => void;
  onRemove: (url: string) => void;
  onTest: (url: string) => void;
}) {
  const c = useColors();
  /** Which row has its Edit options open, and whether it is in the middle of renaming. */
  const [menu, setMenu] = useState<string>();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");

  if (servers.length === 0) return <T size={13} muted>No servers saved yet. Tap + to add one.</T>;

  const close = () => {
    setMenu(undefined);
    setRenaming(false);
  };

  return (
    <View style={{ gap: 10 }}>
      {servers.map((s) => {
        const inUse = normalizeUrl(s.url) === normalizeUrl(current);
        const open = menu === s.url;
        const isTesting = testing === s.url;
        return (
          <View key={s.url} style={{ borderWidth: 1, borderRadius: 14, borderColor: inUse ? c.primary : c.border, padding: 12, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={inUse ? `${s.name}, in use` : `Switch to ${s.name}`}
                disabled={inUse || busy || open}
                onPress={() => onUse(s.url)}
                style={{ flex: 1, gap: 2 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <T weight="semibold" style={{ flexShrink: 1 }} numberOfLines={1}>{s.name}</T>
                  {inUse && <Badge label="In use" tone="accent" />}
                </View>
                <Mono size={12} color={c.muted} numberOfLines={1}>{s.url}</Mono>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={open ? `Close options for ${s.name}` : `Edit ${s.name}`}
                hitSlop={8}
                onPress={() => (open ? close() : (setMenu(s.url), setRenaming(false)))}
                style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: open ? c.border : "transparent" }}
              >
                <Feather name={open ? "x" : "edit-2"} size={17} color={c.accentText} />
              </Pressable>
            </View>

            {/* Connection status: a test button until the server has been verified. */}
            {!inUse && !open &&
              (s.checkedAt ? (
                <T size={12} style={{ color: c.ok }}>✓ Reachable</T>
              ) : (
                <View style={{ flexDirection: "row" }}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => onTest(s.url)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border }}
                  >
                    {isTesting ? <ActivityIndicator size="small" color={c.accentText} /> : <Feather name="activity" size={14} color={c.accentText} />}
                    <T size={13} weight="semibold" style={{ color: c.accentText }}>{isTesting ? "Testing…" : "Test connection"}</T>
                  </Pressable>
                </View>
              ))}

            {open && !renaming && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Rename"
                    kind="secondary"
                    onPress={() => {
                      setDraft(s.name);
                      setRenaming(true);
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Delete"
                    kind="danger"
                    disabled={busy}
                    onPress={() => {
                      close();
                      onRemove(s.url);
                    }}
                  />
                </View>
              </View>
            )}

            {open && renaming && (
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
                        close();
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Cancel" kind="secondary" onPress={() => setRenaming(false)} />
                  </View>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
