import { Nod } from "@nod/sdk";
import { Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { required } from "./env.js";

const nod = new Nod({ apiUrl: required("NOD_API_URL"), agentKey: required("NOD_AGENT_KEY") });
const connection = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const owner = new PublicKey(required("NOD_OWNER_PUBKEY"));

// A fresh recipient per run, so every payment looks like a "new recipient".
const vendor = Keypair.generate().publicKey;

async function buildPayment(sol: number): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions: [SystemProgram.transfer({ fromPubkey: owner, toPubkey: vendor, lamports: Math.round(sol * 1e9) })],
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString("base64");
}

const scenarios = [
  { sol: 0.01, reason: "Pay for weather API credits" },
  { sol: 0.5, reason: "Prepay annual data subscription" },
];

for (const s of scenarios) {
  const proposal = await nod.propose({
    transaction: await buildPayment(s.sol),
    reason: s.reason,
    // Honest agent: states exactly what the transaction does, so the phone can confirm it.
    intent: { sol: s.sol, recipient: vendor.toBase58() },
  });
  console.log(`[${s.reason}] ${s.sol} SOL -> ${proposal.status} (${proposal.tier})`);
  if (proposal.status === "blocked") {
    console.log(`  blocked: ${proposal.blockReason}`);
    continue;
  }
  const final = await nod.waitForResult(proposal.id);
  console.log(`  result: ${final.status}${final.signature ? ` sig=${final.signature}` : ""}`);
}
