import { Feather } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { useColors, type ThemePref } from "../theme/colors";

const OPTIONS: Array<{ value: ThemePref; icon: "monitor" | "sun" | "moon"; label: string }> = [
  { value: "system", icon: "monitor", label: "Match this phone" },
  { value: "light", icon: "sun", label: "Light" },
  { value: "dark", icon: "moon", label: "Dark" },
];

/** A compact three-icon switch: match the phone, light, or dark. */
export function ThemeSwitch({ value, onChange }: { value: ThemePref; onChange: (next: ThemePref) => void }) {
  const c = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{ flexDirection: "row", gap: 2, padding: 3, borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg }}
    >
      {OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={{ width: 40, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: selected ? c.primary : "transparent" }}
          >
            <Feather name={o.icon} size={18} color={selected ? c.onPrimary : c.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}
