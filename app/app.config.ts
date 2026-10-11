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
    versionCode: 6, // bump on every release build; Android refuses lower numbers
    googleServicesFile,
    permissions: ["USE_BIOMETRIC"],
    // App Links for the landing site, so Android verifies this app against its assetlinks.json (what Phantom
    // checks before it re-authorizes silently). Scoped to one path so ordinary links to the site still open the browser.
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "nod-sol.vercel.app", pathPrefix: "/open-nod" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    adaptiveIcon: {
      backgroundColor: "#070606",
      foregroundImage: "./assets/android-icon-foreground.png",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-font",
    ["expo-splash-screen", { image: "./assets/splash-icon.png", backgroundColor: "#070606", imageWidth: 200 }],
    "expo-secure-store",
    ["expo-local-authentication", { faceIDPermission: "Nod uses biometrics to confirm approvals." }],
    "expo-notifications",
    "./plugins/withReleaseSigning",
    ["expo-build-properties", { android: { minSdkVersion: 26 } }],
  ],
};

export default config;
