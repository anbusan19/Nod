import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api, getServerUrl } from "../api/client";
import { kv } from "../storage";
import { decidePushStatus, type PushStatus } from "./status";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Registers the device's FCM token with the backend. Safe to call repeatedly. */
/** True when the user switched push off in Settings, so it must not quietly come back at the next launch. */
export async function pushOptedOut(): Promise<boolean> {
  return (await kv.get("pushOptOut")) === "1";
}

export async function registerForPush(): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS !== "android") return { ok: false, reason: "Android only" };
  if (await pushOptedOut()) return { ok: false, reason: "Turned off in Settings" };
  try {
    await Notifications.setNotificationChannelAsync("approvals", {
      name: "Approvals",
      importance: Notifications.AndroidImportance.MAX,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: "Notification permission denied" };
    const token = await Notifications.getDevicePushTokenAsync();
    await api.updateDevice({ fcmToken: String(token.data) });
    await kv.set("pushServer", await getServerUrl()); // remember which backend knows this phone's push token
    return { ok: true };
  } catch (e) {
    // Most commonly: no google-services.json in this build.
    return { ok: false, reason: (e as Error).message };
  }
}

/** Settings toggle ON: allow push again, ask for permission if needed, and register with the backend. */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  await kv.remove("pushOptOut");
  return registerForPush();
}

/**
 * Settings toggle OFF: tell the backend to forget this phone's push token, and remember the choice.
 * Android's notification permission stays as it is; an app cannot revoke it itself.
 */
export async function disablePush(): Promise<void> {
  // Ask the backend first. Remember "off" only once it has agreed, so the two can't disagree.
  await api.updateDevice({ fcmToken: null });
  await kv.set("pushOptOut", "1");
  await kv.remove("pushServer");
}

/** Whether push is working for the backend in use right now. */
export async function getPushStatus(): Promise<PushStatus> {
  if (Platform.OS !== "android") return "off";
  if (await pushOptedOut()) return "off";
  const perm = await Notifications.getPermissionsAsync();
  return decidePushStatus({
    granted: perm.granted,
    canAskAgain: perm.canAskAgain,
    registeredServer: await kv.get("pushServer"),
    currentServer: await getServerUrl(),
  });
}

/** Calls back with the proposal id from a tapped notification (data-only payload). */
export function onProposalOpened(cb: (proposalId: string) => void): () => void {
  const handle = (n: Notifications.Notification | Notifications.NotificationResponse) => {
    const data = "notification" in n ? n.notification.request.content.data : n.request.content.data;
    const id = (data as any)?.proposalId;
    if (typeof id === "string") cb(id);
  };
  // A tapped notification that launched the app is replayed here. Open it once, then forget it,
  // or the same old card would reopen every time the app starts.
  Notifications.getLastNotificationResponseAsync().then((r) => {
    if (!r) return;
    handle(r);
    Notifications.clearLastNotificationResponse();
  });
  const a = Notifications.addNotificationResponseReceivedListener((r) => {
    handle(r);
    Notifications.clearLastNotificationResponse();
  });
  const b = Notifications.addNotificationReceivedListener(handle);
  return () => {
    a.remove();
    b.remove();
  };
}
