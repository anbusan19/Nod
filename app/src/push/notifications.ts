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
export async function registerForPush(): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS !== "android") return { ok: false, reason: "Android only" };
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

/** Whether push is working for the backend in use right now. */
export async function getPushStatus(): Promise<PushStatus> {
  if (Platform.OS !== "android") return "off";
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
  Notifications.getLastNotificationResponseAsync().then((r) => r && handle(r));
  const a = Notifications.addNotificationResponseReceivedListener(handle);
  const b = Notifications.addNotificationReceivedListener(handle);
  return () => {
    a.remove();
    b.remove();
  };
}
