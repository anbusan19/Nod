import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "../api/client";

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
    return { ok: true };
  } catch (e) {
    // Most commonly: no google-services.json in this build.
    return { ok: false, reason: (e as Error).message };
  }
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
