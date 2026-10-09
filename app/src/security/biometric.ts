import * as LocalAuthentication from "expo-local-authentication";
import { kv } from "../storage";
import { parsePrefs, planAuth, type AuthPlan, type AuthPrefs, type EnrolledLevel } from "./authPlan";

export type BiometricResult = { ok: true } | { ok: false; reason: string };

export async function loadPrefs(): Promise<AuthPrefs> {
  return parsePrefs(await kv.get("authPrefs"));
}

export async function savePrefs(prefs: AuthPrefs): Promise<void> {
  await kv.set("authPrefs", JSON.stringify(prefs));
}

async function enrolledLevel(): Promise<EnrolledLevel> {
  const L = LocalAuthentication.SecurityLevel;
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  return level === L.BIOMETRIC_STRONG ? 3 : level === L.BIOMETRIC_WEAK ? 2 : level === L.SECRET ? 1 : 0;
}

/** What approvals will use right now, given the user's choices and what is set up on the phone. */
export async function currentPlan(): Promise<AuthPlan & { prefs: AuthPrefs }> {
  const prefs = await loadPrefs();
  return { ...planAuth(prefs, await enrolledLevel()), prefs };
}

/** Which sensors the phone has at all (not whether anything is enrolled). */
export async function availableSensors(): Promise<{ fingerprint: boolean; face: boolean }> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const T = LocalAuthentication.AuthenticationType;
  return { fingerprint: types.includes(T.FINGERPRINT), face: types.includes(T.FACIAL_RECOGNITION) };
}

/** App-level gate before asking the wallet to sign. The wallet does its own check too. */
export async function confirmWithBiometrics(prompt: string): Promise<BiometricResult> {
  const plan = await currentPlan();
  if (plan.blocked) {
    return { ok: false, reason: "Set up a screen lock (PIN, pattern or password) on this phone to approve transactions." };
  }
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    cancelLabel: "Cancel",
    biometricsSecurityLevel: plan.securityLevel,
    disableDeviceFallback: plan.disableDeviceFallback,
  });
  return res.success ? { ok: true } : { ok: false, reason: res.error === "user_cancel" ? "Cancelled" : "Authentication failed" };
}
