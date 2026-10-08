import "react-native-get-random-values";
import { Buffer } from "buffer";

// @solana/web3.js expects a global Buffer.
if (!(globalThis as any).Buffer) {
  (globalThis as any).Buffer = Buffer;
}
