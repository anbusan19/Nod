// Minimal Jupiter swap API client (lite-api needs no key). The API only serves mainnet liquidity.
const BASE = process.env.JUPITER_API_URL ?? "https://lite-api.jup.ag/swap/v1";

export const WSOL = "So11111111111111111111111111111111111111112";
export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface Quote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  slippageBps: number;
  swapMode: string;
  routePlan: Array<{ swapInfo: { label?: string } }>;
}

async function json(res: Response) {
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? body.message ?? `Jupiter API error ${res.status}`);
  return body;
}

export async function getQuote(p: { inputMint: string; outputMint: string; amount: bigint; slippageBps: number }): Promise<Quote> {
  const url = `${BASE}/quote?inputMint=${p.inputMint}&outputMint=${p.outputMint}&amount=${p.amount}&slippageBps=${p.slippageBps}`;
  return json(await fetch(url));
}

/** An unsigned swap transaction for `user`, base64. */
export async function getSwapTransaction(quote: Quote, user: string): Promise<string> {
  const res = await json(
    await fetch(`${BASE}/swap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteResponse: quote, userPublicKey: user, wrapAndUnwrapSol: true }),
    }),
  );
  return res.swapTransaction;
}

export const routeLabels = (q: Quote) => q.routePlan.map((s) => s.swapInfo.label ?? "?").join(" → ");
