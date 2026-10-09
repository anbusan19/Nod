// A real Jupiter swap, proposed honestly. Usage: npm run swap -- [solAmount]
// Jupiter liquidity is on mainnet, so the proposal is for mainnet. Nod on a devnet build decodes it as a
// preview but will not sign; point Nod at mainnet (and use a funded mainnet wallet) to execute it.
import { Nod } from "@nod/sdk";
import { getQuote, getSwapTransaction, routeLabels, USDC, WSOL } from "./jupiter.js";
import { required } from "./env.js";

const nod = new Nod({ apiUrl: required("NOD_API_URL"), agentKey: required("NOD_AGENT_KEY") });
const owner = required("NOD_OWNER_PUBKEY");
const sol = Number(process.argv[2] ?? "0.01");

const quote = await getQuote({ inputMint: WSOL, outputMint: USDC, amount: BigInt(Math.round(sol * 1e9)), slippageBps: 50 });
console.log(`Quote: ${sol} SOL -> ${Number(quote.outAmount) / 1e6} USDC via ${routeLabels(quote)} (min ${Number(quote.otherAmountThreshold) / 1e6})`);

const proposal = await nod.propose({
  transaction: await getSwapTransaction(quote, owner),
  reason: `Rebalance: swap ${sol} SOL to USDC`,
  cluster: "mainnet-beta",
  // Honest agent: says exactly what the transaction does, including the least it will accept.
  intent: { swap: { inputMint: WSOL, outputMint: USDC, inAmount: quote.inAmount, minOut: quote.otherAmountThreshold } },
});
console.log(`Proposed: ${proposal.status} (${proposal.tier}). Open Nod to review it.`);
if (proposal.status === "awaiting_human") {
  const final = await nod.waitForResult(proposal.id, { timeoutMs: 100_000 }).catch(() => undefined);
  console.log(`Result: ${final?.status ?? "no decision"}${final?.signature ? ` sig=${final.signature}` : ""}`);
}
