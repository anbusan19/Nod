/**
 * Which kinds of confirmation the user accepts for approvals, and how that turns into a request to Android.
 *
 * Android's biometric prompt works by *class*, not by sensor: "strong" is a fingerprint (or a 3D face scan),
 * "weak" adds camera-based face unlock, and the screen lock (PIN, pattern, password) can be allowed as a
 * backup. It cannot be told "only the PIN" while a fingerprint is enrolled, and Nod does not pretend it can.
 */
export interface AuthPrefs {
  fingerprint: boolean;
  face: boolean;
  /** PIN, pattern or password as a backup. */
  screenLock: boolean;
}

export const DEFAULT_PREFS: AuthPrefs = { fingerprint: true, face: true, screenLock: true };

/** What Android reports is enrolled: 0 nothing, 1 screen lock only, 2 weak biometric (face), 3 strong (fingerprint). */
export type EnrolledLevel = 0 | 1 | 2 | 3;

/** At least one method must stay ticked, otherwise there would be no way to approve anything. */
export function normalizePrefs(p: Partial<AuthPrefs> | null | undefined): AuthPrefs {
  const prefs = { ...DEFAULT_PREFS, ...(p ?? {}) };
  if (!prefs.fingerprint && !prefs.face && !prefs.screenLock) prefs.screenLock = true;
  return prefs;
}

export interface AuthPlan {
  /** Nothing is set up on the phone, so approvals cannot be confirmed at all. */
  blocked: boolean;
  securityLevel: "strong" | "weak";
  /** True when the screen lock must not be offered. */
  disableDeviceFallback: boolean;
  /** What will actually confirm an approval, in words. */
  summary: string;
  /** Present when the choice cannot be honoured exactly and what happens instead. */
  note?: string;
}

export function planAuth(input: Partial<AuthPrefs> | null | undefined, level: EnrolledLevel): AuthPlan {
  const prefs = normalizePrefs(input);
  if (level === 0) {
    return { blocked: true, securityLevel: "weak", disableDeviceFallback: false, summary: "Nothing is set up to confirm approvals.", note: "Set a screen lock (PIN, pattern or password) in Android settings." };
  }

  const wantsBiometric = prefs.fingerprint || prefs.face;
  // The "weak" class includes strong biometrics, so face ticked means weak is requested.
  const securityLevel: "strong" | "weak" = prefs.face ? "weak" : "strong";
  const enough = wantsBiometric && (prefs.face ? level >= 2 : level >= 3);

  // Never lock the user out: keep the screen lock when the ticked biometrics aren't actually set up.
  const keepFallback = prefs.screenLock || !enough;

  const names = [prefs.fingerprint && "fingerprint", prefs.face && "face"].filter(Boolean).join(" or ");
  let summary: string;
  let note: string | undefined;
  if (!wantsBiometric) {
    summary = "Your screen lock (PIN, pattern or password).";
    if (level >= 3) note = "Android may also offer your enrolled fingerprint, which is at least as strong.";
  } else if (enough) {
    summary = prefs.screenLock ? `Your ${names}, or your screen lock as a backup.` : `Your ${names} only.`;
  } else {
    summary = "Your screen lock (PIN, pattern or password).";
    note = `${names[0].toUpperCase()}${names.slice(1)} isn't set up on this phone, so your screen lock is used. Set it up in Android settings to use it.`;
  }
  return { blocked: false, securityLevel, disableDeviceFallback: !keepFallback, summary, note };
}

export function parsePrefs(raw: string | null): AuthPrefs {
  try {
    return normalizePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_PREFS;
  }
}
