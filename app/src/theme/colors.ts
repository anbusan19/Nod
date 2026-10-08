import { useColorScheme } from "react-native";

const light = {
  bg: "#F6F7F9",
  card: "#FFFFFF",
  text: "#0B0D12",
  muted: "#5B6472",
  border: "#E3E6EB",
  primary: "#2F5BFF",
  onPrimary: "#FFFFFF",
  ok: "#12805C",
  warn: "#B45309",
  danger: "#C62828",
  dangerBg: "#FDECEC",
  warnBg: "#FFF3E0",
  okBg: "#E6F6EF",
};

const dark: typeof light = {
  bg: "#0B0D12",
  card: "#151922",
  text: "#F2F4F8",
  muted: "#9AA3B2",
  border: "#262C38",
  primary: "#6C8BFF",
  onPrimary: "#0B0D12",
  ok: "#4CD7A0",
  warn: "#F5B25B",
  danger: "#FF7A7A",
  dangerBg: "#2A1618",
  warnBg: "#2A2012",
  okBg: "#10261D",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}
