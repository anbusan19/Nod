import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export function transferTx(from: Keypair, to: PublicKey, lamports: number): string {
  const msg = new TransactionMessage({
    payerKey: from.publicKey,
    recentBlockhash: "11111111111111111111111111111111",
    instructions: [SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports })],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  return Buffer.from(tx.serialize()).toString("base64");
}
