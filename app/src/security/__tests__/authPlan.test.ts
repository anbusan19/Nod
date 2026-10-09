import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, normalizePrefs, parsePrefs, planAuth } from "../authPlan";

const P = (fingerprint: boolean, face: boolean, screenLock: boolean) => ({ fingerprint, face, screenLock });

describe("normalizePrefs", () => {
  it("keeps at least one method ticked", () => {
    expect(normalizePrefs(P(false, false, false))).toEqual(P(false, false, true));
    expect(normalizePrefs({ face: false })).toEqual(P(true, false, true));
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
  });
  it("survives junk in storage", () => {
    expect(parsePrefs("{not json")).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"face":false,"fingerprint":false,"screenLock":false}')).toEqual(P(false, false, true));
  });
});

describe("planAuth", () => {
  it("blocks when nothing is set up on the phone", () => {
    expect(planAuth(DEFAULT_PREFS, 0).blocked).toBe(true);
  });

  it("default: any enrolled biometric or the screen lock", () => {
    const plan = planAuth(DEFAULT_PREFS, 3);
    expect(plan).toMatchObject({ blocked: false, securityLevel: "weak", disableDeviceFallback: false });
    expect(plan.note).toBeUndefined();
  });

  it("fingerprint only asks Android for the strong class", () => {
    expect(planAuth(P(true, false, true), 3).securityLevel).toBe("strong");
  });

  it("face ticked asks for the weak class, which includes fingerprints", () => {
    expect(planAuth(P(false, true, true), 2).securityLevel).toBe("weak");
    expect(planAuth(P(true, true, true), 3).securityLevel).toBe("weak");
  });

  it("without the screen-lock backup, the prompt disables it, when the biometric really is set up", () => {
    const plan = planAuth(P(true, false, false), 3);
    expect(plan.disableDeviceFallback).toBe(true);
    expect(plan.summary).toBe("Your fingerprint only.");
  });

  it("never locks the user out: ticked biometric not set up, so the screen lock stays on and a note says why", () => {
    const faceOnlyPhone = planAuth(P(true, false, false), 2); // wants fingerprint, only a face is enrolled
    expect(faceOnlyPhone.disableDeviceFallback).toBe(false);
    expect(faceOnlyPhone.note).toMatch(/Fingerprint isn't set up/);
    const pinOnlyPhone = planAuth(P(false, true, false), 1); // wants face, only a PIN exists
    expect(pinOnlyPhone.disableDeviceFallback).toBe(false);
    expect(pinOnlyPhone.note).toMatch(/Face isn't set up/);
  });

  it("screen lock only is allowed, with an honest note when a fingerprint exists", () => {
    const plan = planAuth(P(false, false, true), 3);
    expect(plan.summary).toMatch(/screen lock/i);
    expect(plan.note).toMatch(/may also offer your enrolled fingerprint/);
    expect(planAuth(P(false, false, true), 1).note).toBeUndefined();
  });

  it("warns when a working biometric has no backup, and only then", () => {
    expect(planAuth(P(false, true, false), 2).warning).toMatch(/No backup: if your face can't be read \(poor light/);
    expect(planAuth(P(true, false, false), 3).warning).toMatch(/Turn Screen lock back on/);
    expect(planAuth(P(false, true, true), 2).warning).toBeUndefined(); // backup ticked
    expect(planAuth(P(true, false, false), 2).warning).toBeUndefined(); // biometric not set up: the screen lock is used anyway
    expect(planAuth(P(false, false, true), 3).warning).toBeUndefined();
  });

  it("describes face-or-fingerprint choices", () => {
    expect(planAuth(P(true, true, false), 3).summary).toBe("Your fingerprint or face only.");
    expect(planAuth(P(false, true, true), 2).summary).toBe("Your face, or your screen lock as a backup.");
  });
});
