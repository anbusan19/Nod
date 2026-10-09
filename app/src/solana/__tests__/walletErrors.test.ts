import { describe, expect, it } from "vitest";
import { classifyWalletError } from "../walletErrors";

describe("classifyWalletError", () => {
  it("treats backing out of Phantom (the native 'Cannot send in CLOSED') as a cancellation, not a failure", () => {
    const r = classifyWalletError(new Error("Cannot send in CLOSED"));
    expect(r).toMatchObject({ kind: "cancelled", retryable: true });
    expect(r.message).toMatch(/Nothing was sent/);
  });

  it("recognizes the adapter's own session-ended codes", () => {
    for (const code of ["ERROR_SESSION_CLOSED", "ERROR_SESSION_TIMEOUT", "ERROR_ASSOCIATION_CANCELLED"]) {
      expect(classifyWalletError({ code, message: "x" })).toMatchObject({ kind: "cancelled", retryable: true });
    }
  });

  it("treats the wallet saying no (declined to sign, authorization refused) as a decline", () => {
    expect(classifyWalletError({ code: -3, message: "not signed" })).toMatchObject({ kind: "declined", retryable: true });
    expect(classifyWalletError({ code: -1, message: "authorization request failed" })).toMatchObject({ kind: "declined", retryable: true });
  });

  it("explains a missing wallet app and does not offer a retry", () => {
    expect(classifyWalletError({ code: "ERROR_WALLET_NOT_FOUND", message: "x" })).toMatchObject({ kind: "no-wallet", retryable: false });
  });

  it("leaves real failures alone, with their own message", () => {
    expect(classifyWalletError(new Error("Transaction simulation failed: Blockhash not found"))).toEqual({
      kind: "other",
      retryable: false,
      message: "Transaction simulation failed: Blockhash not found",
    });
    expect(classifyWalletError({ code: -4, message: "not submitted" }).kind).toBe("other");
  });

  it("copes with odd values", () => {
    expect(classifyWalletError(undefined).kind).toBe("other");
    expect(classifyWalletError("boom").message).toBe("boom");
  });
});
