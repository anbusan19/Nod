import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { USDC_MINT, WSOL_MINT, jupiterSwap, transferSol } from "../src/solana.js";

describe("transferSol", () => {
  const from = Keypair.generate().publicKey;
  const to = Keypair.generate().publicKey;
  const connection = { getLatestBlockhash: async () => ({ blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 }) };

  it("builds a one-instruction transfer and states it honestly", async () => {
    const built = await transferSol({ connection, from, to, sol: 0.25 });
    const msg = VersionedTransaction.deserialize(Buffer.from(built.transaction, "base64")).message;
    expect(msg.compiledInstructions).toHaveLength(1);
    expect(Buffer.from(msg.compiledInstructions[0].data).readBigUInt64LE(4)).toBe(250_000_000n);
    expect(msg.staticAccountKeys[0].equals(from)).toBe(true);
    expect(built.intent).toEqual({ sol: 0.25, recipient: to.toBase58() });
    expect(built.cluster).toBe("devnet");
  });

  it("accepts string addresses and rejects non-positive amounts", async () => {
    await expect(transferSol({ connection, from: from.toBase58(), to: to.toBase58(), sol: 1 })).resolves.toBeDefined();
    await expect(transferSol({ connection, from, to, sol: 0 })).rejects.toThrow(/greater than 0/);
  });
});

describe("jupiterSwap", () => {
  const quote = { inputMint: WSOL_MINT, outputMint: USDC_MINT, inAmount: "10000000", outAmount: "1100668", otherAmountThreshold: "1095165", slippageBps: 50, swapMode: "ExactIn", routePlan: [] };

  it("quotes, builds the swap, and states the pair, amount and minimum", async () => {
    const f = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/quote") ? quote : { swapTransaction: "BASE64TX" }), { status: 200 }));
    const owner = Keypair.generate().publicKey;
    const built = await jupiterSwap({ owner, inputMint: WSOL_MINT, outputMint: USDC_MINT, amount: 10_000_000n, fetch: f as any });
    expect(built.transaction).toBe("BASE64TX");
    expect(built.cluster).toBe("mainnet-beta");
    expect(built.intent.swap).toEqual({ inputMint: WSOL_MINT, outputMint: USDC_MINT, inAmount: "10000000", minOut: "1095165" });
    expect((f.mock.calls[0] as any)[0]).toContain("amount=10000000&slippageBps=50");
    expect(JSON.parse((f.mock.calls[1] as any)[1].body).userPublicKey).toBe(owner.toBase58());
  });

  it("reports an upstream error clearly", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: "Could not find any route" }), { status: 400 }));
    await expect(jupiterSwap({ owner: Keypair.generate().publicKey, inputMint: WSOL_MINT, outputMint: USDC_MINT, amount: 1, fetch: f as any })).rejects.toThrow("Could not find any route");
  });
});
