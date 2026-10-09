import { Image, View, type ViewStyle, type StyleProp } from "react-native";
import { useIsDark } from "../theme/colors";

/** The knot mark. Dark artwork on dark, the light artwork on light (multiplied so its white backdrop melts into the page). */
export function Logo({ size, radius, style }: { size: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const dark = useIsDark();
  const r = radius ?? size * 0.22;
  return (
    <View style={[{ width: size, height: size, borderRadius: r, overflow: "hidden" }, !dark && { mixBlendMode: "multiply" }, style]}>
      <Image
        source={dark ? require("../../assets/icon.png") : require("../../assets/icon-light.png")}
        accessibilityLabel="Nod logo"
        style={{ width: size, height: size }}
      />
    </View>
  );
}
