import { existsSync } from "node:fs";
import type { ExpoConfig } from "expo/config";

// google-services.json is not committed. Drop yours at app/google-services.json
// to enable FCM push; without it the app still builds but cannot receive push.
const googleServicesFile = existsSync("./google-services.json") ? "./google-services.json" : undefined;

const config: ExpoConfig = {
  name: "Nod",
  slug: "nod",
  scheme: "nod",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  android: {
    package: "app.nod.mobile",
    googleServicesFile,
    permissions: ["USE_BIOMETRIC"],
    adaptiveIcon: {
      backgroundColor: "#0B0D12",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-font",
    "expo-secure-store",
    ["expo-local-authentication", { faceIDPermission: "Nod uses biometrics to confirm approvals." }],
    "expo-notifications",
    ["expo-build-properties", { android: { minSdkVersion: 26 } }],
  ],
};

export default config;
