/**
 * Tells "the user backed out of the wallet" apart from "something actually broke".
 *
 * Backing out is the user's choice, not a failed payment: nothing was signed or sent, the proposal is still
 * waiting, and they can try again until it expires. Only real failures should mark a proposal failed.
 */
export type WalletErrorKind = "declined" | "cancelled" | "no-wallet" | "other";

export interface WalletErrorInfo {
  kind: WalletErrorKind;
  /** Plain words for the user. */
  message: string;
  /** True when the user can simply try again. */
  retryable: boolean;
}

// Numeric codes from the Mobile Wallet Adapter protocol (the wallet answering "no").
const PROTOCOL_AUTHORIZATION_FAILED = -1;
const PROTOCOL_NOT_SIGNED = -3;

// String codes raised by the adapter library when the session itself ends.
const SESSION_ENDED = new Set(["ERROR_SESSION_CLOSED", "ERROR_SESSION_TIMEOUT", "ERROR_ASSOCIATION_CANCELLED"]);

export function classifyWalletError(e: unknown): WalletErrorInfo {
  const err = (e ?? {}) as { code?: unknown; message?: unknown };
  const code = err.code;
  const message = typeof err.message === "string" ? err.message : String(e);

  if (code === PROTOCOL_NOT_SIGNED || code === PROTOCOL_AUTHORIZATION_FAILED) {
    return { kind: "declined", retryable: true, message: "You declined in your wallet. Nothing was sent. You can try again before the time runs out." };
  }
  if (code === "ERROR_WALLET_NOT_FOUND") {
    return { kind: "no-wallet", retryable: false, message: "No wallet app was found on this phone. Install Phantom or Solflare." };
  }
  // The wallet screen was closed under us. The native layer reports it as e.g. "Cannot send in CLOSED".
  if ((typeof code === "string" && SESSION_ENDED.has(code)) || /\bclosed\b|session (ended|closed)|cancell?ed/i.test(message)) {
    return { kind: "cancelled", retryable: true, message: "You left the wallet before signing. Nothing was sent. You can try again before the time runs out." };
  }
  return { kind: "other", retryable: false, message };
}
