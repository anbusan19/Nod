export type PushStatus = "on" | "off" | "blocked";

/**
 * Push is "on" only when Android allows notifications AND this phone has registered its token with the
 * backend it is using now. "blocked" means the user must change it in Android's settings.
 */
export function decidePushStatus(p: { granted: boolean; canAskAgain: boolean; registeredServer: string | null; currentServer: string }): PushStatus {
  if (!p.granted) return p.canAskAgain ? "off" : "blocked";
  return p.registeredServer === p.currentServer ? "on" : "off";
}
