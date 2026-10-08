import { GeistMono_400Regular, GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";

// Android ignores fontWeight for custom fonts, so each weight is its own family.
export const fonts = {
  jakarta: { regular: "Jakarta-Regular", semibold: "Jakarta-SemiBold", bold: "Jakarta-Bold" },
  mono: { regular: "GeistMono-Regular", medium: "GeistMono-Medium" },
} as const;

export const fontAssets = {
  [fonts.jakarta.regular]: PlusJakartaSans_400Regular,
  [fonts.jakarta.semibold]: PlusJakartaSans_600SemiBold,
  [fonts.jakarta.bold]: PlusJakartaSans_700Bold,
  [fonts.mono.regular]: GeistMono_400Regular,
  [fonts.mono.medium]: GeistMono_500Medium,
};
