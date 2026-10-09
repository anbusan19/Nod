import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { useColors } from "../theme/colors";
import { T } from "./ui";

const HOLD_MS = 1000;
const TICK_MS = 200;

/**
 * Confirms only after the user keeps pressing for about one second. Letting go early cancels,
 * so a stray or reflex tap can never approve. Screen-reader users, who cannot hold a gesture,
 * confirm with a normal activation instead.
 */
export function HoldButton({
  title,
  holdingTitle = "Keep holding…",
  onConfirm,
  disabled,
  loading,
  tone = "primary",
}: {
  title: string;
  holdingTitle?: string;
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "danger" | "primary";
}) {
  const c = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  const done = useRef(false);
  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [holding, setHolding] = useState(false);
  const [screenReader, setScreenReader] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReader);
    return () => {
      sub.remove();
      if (ticker.current) clearInterval(ticker.current);
    };
  }, []);

  const stop = useCallback(() => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = undefined;
    setHolding(false);
  }, []);

  const start = useCallback(() => {
    if (disabled || loading || done.current) return;
    setHolding(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    ticker.current = setInterval(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), TICK_MS);
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => {
      if (!finished || done.current) return;
      done.current = true;
      stop();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onConfirm();
    });
  }, [disabled, loading, onConfirm, progress, stop]);

  const cancel = useCallback(() => {
    if (done.current) return;
    stop();
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  }, [progress, stop]);

  // The component stays mounted after confirming, so allow another attempt if it failed.
  useEffect(() => {
    if (!loading && done.current) {
      done.current = false;
      progress.setValue(0);
    }
  }, [loading, progress]);

  // Same look as the app's other primary buttons; the progress fill darkens/lightens it as you hold.
  const bg = tone === "primary" ? c.primary : c.dangerBg;
  const fg = tone === "primary" ? c.onPrimary : c.danger;
  const border = tone === "primary" ? c.primary : c.danger;
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={screenReader ? "Double tap to confirm" : "Press and hold to confirm"}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPressIn={screenReader ? undefined : start}
      onPressOut={screenReader ? undefined : cancel}
      onPress={screenReader ? onConfirm : undefined}
      style={[styles.btn, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : 1 }]}
    >
      <Animated.View style={[styles.fill, { width, backgroundColor: fg, opacity: 0.35 }]} pointerEvents="none" />
      <View pointerEvents="none">
        <T weight="semibold" style={{ color: fg }}>{loading ? "Sending…" : holding ? holdingTitle : title}</T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 56, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", overflow: "hidden", paddingHorizontal: 18 },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0 },
});
