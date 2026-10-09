// Attack scenarios that show where Nod stops a bad agent. Usage:
//   npm run tamper -- <liar|unknown|delegate|assign|swap-backend|all>
import { Nod, type Proposal } from "@nod/sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { DatabaseSync } from "node:sqlite";
import { required } from "./env.js";

const nod = new Nod({ apiUrl: required("NOD_API_URL"), agentKey: required("NOD_AGENT_KEY") });
const connection = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const owner = new PublicKey(required("NOD_OWNER_PUBKEY"));
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

async function build(ixs: TransactionInstruction[]): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString("base64");
}

const pay = (to: PublicKey, sol: number) => SystemProgram.transfer({ fromPubkey: owner, toPubkey: to, lamports: Math.round(sol * 1e9) });

function show(label: string, p: Proposal) {
  console.log(`\n[${label}]\n  status: ${p.status} (tier ${p.tier})${p.blockReason ? `\n  blocked by backend: ${p.blockReason}` : ""}`);
}

async function waitForHuman(p: Proposal) {
  console.log("  -> open Nod on the phone and decide within 90 seconds...");
  const final = await nod.waitForResult(p.id, { timeoutMs: 100_000 }).catch(() => undefined);
  console.log(`  result: ${final?.status ?? "no decision"}${final?.signature ? ` sig=${final.signature}` : ""}`);
}

const scenarios: Record<string, () => Promise<void>> = {
  // The agent claims 0.01 SOL to a vendor; the transaction sends 0.9 SOL to someone else. The phone flags
  // the mismatch and demands an extra confirmation. The right move is to reject.
  async liar() {
    const vendor = Keypair.generate().publicKey; // who the agent claims to pay
    const p = await nod.propose({
      transaction: await build([pay(Keypair.generate().publicKey, 0.9)]), // who it actually pays
      reason: "Pay 0.01 SOL for weather API credits",
      intent: { sol: 0.01, recipient: vendor.toBase58() },
    });
    show("liar: reason says 0.01 SOL, transaction sends 0.9 SOL", p);
    if (p.status === "awaiting_human") await waitForHuman(p);
  },

  // A program Nod does not know. The backend blocks it before any push is sent.
  async unknown() {
    const program = Keypair.generate().publicKey;
    const ix = new TransactionInstruction({ programId: program, keys: [{ pubkey: owner, isSigner: true, isWritable: true }], data: Buffer.from([1, 2, 3]) });
    show("unknown program", await nod.propose({ transaction: await build([ix]), reason: "Routine maintenance" }));
  },

  // Gives someone else spending rights over a token account.
  async delegate() {
    const data = Buffer.alloc(9);
    data[0] = 4; // SPL Token: Approve
    data.writeBigUInt64LE(18_446_744_073_709_551_615n, 1);
    const ix = new TransactionInstruction({
      programId: TOKEN_PROGRAM,
      keys: [
        { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
        { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: false },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      data,
    });
    show("unlimited token delegate approval", await nod.propose({ transaction: await build([ix]), reason: "Enable auto-pay" }));
  },

  // Moves ownership of the wallet account to another program. No money moves, so a naive limit check passes.
  async assign() {
    const ix = SystemProgram.assign({ accountPubkey: owner, programId: Keypair.generate().publicKey });
    show("system assign (hand the wallet account to another program)", await nod.propose({ transaction: await build([ix]), reason: "Account housekeeping" }));
  },

  // Simulates a compromised backend that swaps the transaction after the proposal was created.
  async "swap-backend"() {
    const vendor = Keypair.generate().publicKey;
    const honest = await build([pay(vendor, 0.01)]);
    const p = await nod.propose({
      transaction: honest,
      reason: "Pay for weather API credits (0.01 SOL)",
      intent: { sol: 0.01, recipient: vendor.toBase58() },
    });
    show("compromised backend swaps the transaction", p);
    if (p.status !== "awaiting_human") return;
    const evil = await build([pay(Keypair.generate().publicKey, 2)]);
    const dbPath = process.env.NOD_BACKEND_DB ?? new URL("../../backend/nod.db", import.meta.url).pathname;
    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE proposals SET tx_base64 = ? WHERE id = ?").run(evil, p.id); // tx_hash is left unchanged
    console.log("  (backend database now holds a different transaction: 2 SOL to an attacker)");
    await waitForHuman(p);
  },
};

const arg = process.argv[2];
if (!arg || (arg !== "all" && !scenarios[arg])) {
  console.error(`usage: npm run tamper -- <${Object.keys(scenarios).join("|")}|all>`);
  process.exit(1);
}
for (const name of arg === "all" ? Object.keys(scenarios) : [arg]) await scenarios[name]();
