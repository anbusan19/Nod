/**
 * Optional helpers that build transactions for you and describe them honestly in `intent`, so the
 * phone can check the agent's claim against the real transaction. Needs @solana/web3.js.
 */
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, type Connection } from "@solana/web3.js";
import { NodError, NodNetworkError } from "./errors.js";
import type { Cluster, Intent } from "./types.js";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const LAMPORTS_PER_SOL = 1_000_000_000;
const pk = (k: PublicKey | string) => (typeof k === "string" ? new PublicKey(k) : k);

export interface BuiltProposal {
  transaction: string;
  intent: Intent;
  cluster: Cluster;
}

/**
 * A plain SOL transfer from the user's wallet. Pass the result to `nod.propose({ ...built, reason })`.
 * `from` is the user's wallet, the one that will sign in their wallet app.
 */
export async function transferSol(p: {
  connection: Pick<Connection, "getLatestBlockhash">;
  from: PublicKey | string;
  to: PublicKey | string;
  sol: number;
  cluster?: Cluster;
}): Promise<BuiltProposal> {
  if (!(p.sol > 0)) throw new NodError("sol must be greater than 0");
  const from = pk(p.from);
  const to = pk(p.to);
  const lamports = Math.round(p.sol * LAMPORTS_PER_SOL);
  const { blockhash } = await p.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: from,
    recentBlockhash: blockhash,
    instructions: [SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports })],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  return {
    transaction: Buffer.from(tx.serialize()).toString("base64"),
    intent: { sol: p.sol, recipient: to.toBase58() },
    cluster: p.cluster ?? "devnet",
  };
}

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  swapMode: string;
  routePlan: Array<{ swapInfo: { label?: string } }>;
}

export interface BuiltSwap extends BuiltProposal {
  quote: JupiterQuote;
}

const JUPITER = "https://lite-api.jup.ag/swap/v1";

/**
 * An exact-in token swap through Jupiter. Jupiter's liquidity is on mainnet, so the proposal is for
 * `mainnet-beta`. The intent states the pair, the amount, and the least the agent will accept.
 */
export async function jupiterSwap(p: {
  owner: PublicKey | string;
  inputMint: string;
  outputMint: string;
  /** Raw units of the input token, such as lamports for SOL. */
  amount: bigint | number | string;
  slippageBps?: number;
  jupiterUrl?: string;
  fetch?: typeof fetch;
}): Promise<BuiltSwap> {
  const f = p.fetch ?? globalThis.fetch;
  const base = (p.jupiterUrl ?? JUPITER).replace(/\/+$/, "");
  const slippageBps = p.slippageBps ?? 50;

  const call = async (url: string, init?: RequestInit) => {
    let res: Response;
    try {
      res = await f(url, init);
    } catch (e) {
      throw new NodNetworkError("Could not reach the Jupiter API", e);
    }
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new NodError(body?.error ?? body?.message ?? `Jupiter API error ${res.status}`, { status: res.status });
    return body;
  };

  const quote: JupiterQuote = await call(
    `${base}/quote?inputMint=${p.inputMint}&outputMint=${p.outputMint}&amount=${BigInt(p.amount)}&slippageBps=${slippageBps}`,
  );
  const swap = await call(`${base}/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: pk(p.owner).toBase58(), wrapAndUnwrapSol: true }),
  });
  return {
    transaction: swap.swapTransaction,
    intent: { swap: { inputMint: quote.inputMint, outputMint: quote.outputMint, inAmount: quote.inAmount, minOut: quote.otherAmountThreshold } },
    cluster: "mainnet-beta",
    quote,
  };
}
