import { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Button, Card, T } from "./ui";

/**
 * In-app replacement for Alert.alert: same call shape, but drawn in Nod's own style instead of the system dialog.
 * Render <DialogHost /> once near the root, then call dialog.alert(...) from anywhere.
 */
export interface DialogButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

interface DialogState {
  title: string;
  message?: string;
  buttons: DialogButton[];
}

let setState: ((s: DialogState | null) => void) | undefined;

export const dialog = {
  alert(title: string, message?: string, buttons?: DialogButton[]) {
    const state: DialogState = { title, message, buttons: buttons && buttons.length > 0 ? buttons : [{ text: "OK" }] };
    if (setState) setState(state);
  },
};

export function DialogHost() {
  const [state, set] = useState<DialogState | null>(null);
  useEffect(() => {
    setState = set;
    return () => {
      if (setState === set) setState = undefined;
    };
  }, []);

  const close = (b?: DialogButton) => {
    set(null);
    b?.onPress?.();
  };
  const cancel = state?.buttons.find((b) => b.style === "cancel");

  return (
    <Modal visible={state !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => close(cancel)}>
      <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
        <Pressable
          accessibilityLabel="Dismiss"
          onPress={() => close(cancel)}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.62)" }}
        />
        {state && (
          <Card style={{ gap: 12, padding: 20, alignSelf: "center", width: "100%", maxWidth: 420, borderRadius: 20 }} accessibilityViewIsModal>
            <T size={18} weight="bold">{state.title}</T>
            {state.message ? <T muted>{state.message}</T> : null}
            <View style={{ flexDirection: state.buttons.length > 2 ? "column" : "row", gap: 10, marginTop: 6 }}>
              {state.buttons.map((b, i) => (
                <View key={`${b.text}-${i}`} style={{ flex: state.buttons.length > 2 ? undefined : 1 }}>
                  <Button
                    title={b.text}
                    kind={b.style === "destructive" ? "danger" : b.style === "cancel" || state.buttons.length === 1 ? (state.buttons.length === 1 ? "primary" : "secondary") : "primary"}
                    onPress={() => close(b)}
                  />
                </View>
              ))}
            </View>
          </Card>
        )}
      </View>
    </Modal>
  );
}
