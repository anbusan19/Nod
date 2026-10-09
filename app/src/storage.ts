import * as SecureStore from "expo-secure-store";

type Key = "deviceToken" | "deviceId" | "mwaAuthToken" | "walletAddress" | "themePref" | "apiUrl";

export const kv = {
  get: (k: Key) => SecureStore.getItemAsync(k),
  set: (k: Key, v: string) => SecureStore.setItemAsync(k, v),
  remove: (k: Key) => SecureStore.deleteItemAsync(k),
};
