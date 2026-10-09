import * as LocalAuthentication from "expo-local-authentication";

export type BiometricResult = { ok: true } | { ok: false; reason: string };
export type AuthMethod = "biometric" | "screen-lock" | "none";

/**
 * What the phone can use to confirm an approval. Biometrics are preferred; if none are
 * enrolled (or the sensor is broken) the system prompt falls back to the screen lock.
 */
export async function getAuthMethod(): Promise<AuthMethod> {
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) return "none";
  if (level === LocalAuthentication.SecurityLevel.SECRET) return "screen-lock";
  return "biometric";
}

/** App-level gate before asking the wallet to sign. The wallet does its own check too. */
export async function confirmWithBiometrics(prompt: string): Promise<BiometricResult> {
  if ((await getAuthMethod()) === "none") {
    return { ok: false, reason: "Set up a screen lock (PIN, pattern or password) on this phone to approve transactions." };
  }
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });
  return res.success ? { ok: true } : { ok: false, reason: res.error === "user_cancel" ? "Cancelled" : "Authentication failed" };
}
