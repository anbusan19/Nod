import { Appearance, useColorScheme } from "react-native";

const light = {
  bg: "#F6F7F9",
  card: "#FFFFFF",
  text: "#0B0D12",
  muted: "#5B6472",
  border: "#E3E6EB",
  // Buttons use the logo blue in both themes, with the logo's dark background colour as text.
  primary: "#99ACFF",
  onPrimary: "#070606",
  // Blue used for text and thin lines; #99ACFF is too light to read on a light background.
  accentText: "#3A55C8",
  ok: "#12805C",
  warn: "#B45309",
  danger: "#C62828",
  dangerBg: "#FDECEC",
  warnBg: "#FFF3E0",
  okBg: "#E6F6EF",
};

// Dark theme is built on the logo's background (#070606) and its blue (#99ACFF).
const dark: typeof light = {
  bg: "#070606",
  card: "#131212",
  text: "#F3F2F2",
  muted: "#9C9A9A",
  border: "#292727",
  primary: "#99ACFF",
  onPrimary: "#070606",
  accentText: "#99ACFF",
  ok: "#4CD7A0",
  warn: "#F5B25B",
  danger: "#FF7A7A",
  dangerBg: "#2A1517",
  warnBg: "#2A2010",
  okBg: "#0F2219",
};

export type Colors = typeof light;

export type ThemePref = "system" | "light" | "dark";

/** Applies the user's choice app-wide. "system" hands control back to the phone. */
export function applyThemePref(pref: ThemePref) {
  Appearance.setColorScheme(pref === "system" ? "unspecified" : pref);
}

export function useIsDark(): boolean {
  return useColorScheme() === "dark";
}

export function useColors(): Colors {
  return useIsDark() ? dark : light;
}
