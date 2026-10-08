import { createHash, randomBytes, randomUUID } from "node:crypto";
import { config } from "./config.js";

export const newId = () => randomUUID();

export function newSecret(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(config.keySalt).update(secret).digest("hex");
}

/** Short human-friendly code for QR pairing. */
export function newPairingCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}
