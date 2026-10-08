import * as LocalAuthentication from "expo-local-authentication";

export type BiometricResult = { ok: true } | { ok: false; reason: string };

export async function biometricsAvailable(): Promise<boolean> {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

/** App-level gate before asking the wallet to sign. The wallet does its own check too. */
export async function confirmWithBiometrics(prompt: string): Promise<BiometricResult> {
  if (!(await biometricsAvailable())) {
    return { ok: false, reason: "Set up a fingerprint, face or screen lock on this phone to approve transactions." };
  }
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    cancelLabel: "Cancel",
    disableDeviceFallback: false,
  });
  return res.success ? { ok: true } : { ok: false, reason: res.error === "user_cancel" ? "Cancelled" : "Authentication failed" };
}
