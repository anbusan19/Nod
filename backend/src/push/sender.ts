export interface PushSender {
  /** Sends a generic alert. The only identifier in the payload is the proposal id. */
  send(fcmToken: string, proposalId: string): Promise<void>;
}

/** Used when Firebase is not configured (local development, tests). */
export class LogPushSender implements PushSender {
  sent: Array<{ fcmToken: string; proposalId: string }> = [];
  async send(fcmToken: string, proposalId: string) {
    this.sent.push({ fcmToken, proposalId });
    console.log(`[push] (dry-run) proposal ${proposalId} -> ${fcmToken.slice(0, 10)}…`);
  }
}

export async function createPushSender(serviceAccountPath: string | undefined): Promise<PushSender> {
  if (!serviceAccountPath) return new LogPushSender();
  try {
    const { readFileSync } = await import("node:fs");
    // firebase-admin is an optional dependency, loaded only when configured.
    const mod = await (new Function("m", "return import(m)") as (m: string) => Promise<any>)("firebase-admin");
    const admin = mod.default ?? mod;
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(serviceAccountPath, "utf8"))) });
    return {
      async send(fcmToken, proposalId) {
        // The visible text is generic on purpose: no amounts, recipients or reasons leave the backend.
        // `data` carries only the proposal id so the app can open the right card when tapped.
        await admin.messaging().send({
          token: fcmToken,
          data: { proposalId },
          android: {
            priority: "high",
            notification: { channelId: "approvals", title: "Nod", body: "An agent needs your approval", visibility: "public" },
          },
        });
      },
    };
  } catch (e) {
    console.warn("[push] Firebase unavailable, falling back to dry-run:", (e as Error).message);
    return new LogPushSender();
  }
}
