import { ActivityIndicator, Pressable, StyleSheet, Text, View, type TextProps, type ViewProps } from "react-native";
import { fonts } from "../theme/fonts";
import { useColors } from "../theme/colors";

/** UI copy. */
export function T({ style, size = 15, weight = "regular", muted, ...p }: TextProps & { size?: number; weight?: "regular" | "semibold" | "bold"; muted?: boolean }) {
  const c = useColors();
  return <Text {...p} style={[{ fontFamily: fonts.jakarta[weight], fontSize: size, color: muted ? c.muted : c.text }, style]} />;
}

/** Anything the user could copy, compare or verify on an explorer. */
export function Mono({ style, size = 13, medium, color, ...p }: TextProps & { size?: number; medium?: boolean; color?: string }) {
  const c = useColors();
  return (
    <Text
      {...p}
      style={[{ fontFamily: medium ? fonts.mono.medium : fonts.mono.regular, fontSize: size, color: color ?? c.text }, style]}
    />
  );
}

export function Card({ style, ...p }: ViewProps) {
  const c = useColors();
  return <View {...p} style={[{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 16 }, style]} />;
}

export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
}) {
  const c = useColors();
  const bg = kind === "primary" ? c.primary : kind === "danger" ? c.dangerBg : c.card;
  const fg = kind === "primary" ? c.onPrimary : kind === "danger" ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: kind === "secondary" ? c.border : bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <T weight="semibold" style={{ color: fg }}>{title}</T>}
    </Pressable>
  );
}

export function Badge({ label, tone }: { label: string; tone: "danger" | "warn" | "ok" | "neutral" }) {
  const c = useColors();
  const map = {
    danger: [c.dangerBg, c.danger],
    warn: [c.warnBg, c.warn],
    ok: [c.okBg, c.ok],
    neutral: [c.border, c.muted],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" }}>
      <T size={12} weight="semibold" style={{ color: fg }}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
});
