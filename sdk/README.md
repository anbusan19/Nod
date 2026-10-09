# nod-sdk

Connect any AI agent to **Nod**. Your agent proposes a Solana transaction; a person sees what it *really* does on their phone and approves it with one deliberate tap. The agent never holds the key that moves the funds.

```
agent  ──propose(tx, reason)──▶  Nod backend  ──push──▶  phone: decode, simulate, approve  ──▶  Solana
  ▲                                                                                              │
  └──────────────────────────────── result: confirmed / rejected / expired / blocked ◀───────────┘
```

- **No dependencies** in the core client. Needs Node 18+. It uses only `fetch` and `AbortController`, so it should also run in Bun, Deno and edge runtimes (not yet tested there).
- **Retry-safe.** Every proposal carries an idempotency key, so a network blip can never create a duplicate payment request.
- **Honest by construction.** The `transferSol` and `jupiterSwap` helpers state what they do in `intent`, and the phone checks that claim against the real transaction.
- Not written in JavaScript? Skip to [Plain HTTP](#plain-http).

## Install

> **Not on npm yet.** Until it is published, install from a clone of this repository:
> `git clone <repo> && cd nod && npm install && npm run build:sdk`, then `npm install /path/to/nod/sdk` in your agent project
> (or `cd sdk && npm pack` and install the resulting `.tgz`). After publishing, the commands below work as written.

```bash
npm install nod-sdk
npm install @solana/web3.js   # only if you use the transaction helpers in nod-sdk/solana
```

## Quickstart (about two minutes)

**1. Install the Nod app on your phone**, connect your wallet, and open **Agents → Show pairing code**.

**2. Pair your agent** (the code lasts 5 minutes and works once):

```bash
npx nod-sdk pair AB12CD34 --name my-agent --api https://your-nod-backend.example.com
# Paired agent 1e2f…
# NOD_API_URL=https://your-nod-backend.example.com
# NOD_AGENT_KEY=nodk_…        ← keep this secret
```

**3. Propose a payment:**

```ts
import { Nod, isConfirmed } from "nod-sdk";
import { transferSol } from "nod-sdk/solana";
import { Connection } from "@solana/web3.js";

const nod = new Nod({ apiUrl: process.env.NOD_API_URL!, agentKey: process.env.NOD_AGENT_KEY! });
const connection = new Connection("https://api.devnet.solana.com");

const built = await transferSol({
  connection,
  from: "YOUR_WALLET_ADDRESS",   // the wallet the user signs with
  to: "VENDOR_ADDRESS",
  sol: 0.05,
});

const result = await nod.proposeAndWait({ ...built, reason: "Weather API credits" });

if (isConfirmed(result)) console.log("paid", result.signature);
else console.log("not paid:", result.status, result.blockReason ?? "");
```

Your phone buzzes with a decoded card. Approve, and `result.signature` is the on-chain transaction.

## How decisions work

Every proposal gets a **tier** from the user's policy for your agent:

| Outcome (`status`) | Meaning | Final? |
|---|---|---|
| `awaiting_human` | Waiting for the user. Expires after about 90 seconds. | no |
| `approved` / `submitted` | The user approved; the transaction is on its way. | no |
| `confirmed` | **Landed on-chain.** `signature` is set. | yes |
| `rejected` | The user said no. | yes |
| `expired` | Nobody decided in time. Propose again if it still matters. | yes |
| `blocked` | Refused automatically. `blockReason` says why: unknown program, over the hard cap, daily cap reached, grants spending authority, or agent frozen. | yes |
| `failed` | Approved but failed on-chain or during signing. `error` says why. | yes |
| `auto_approved` | Within the user's auto limit. *(The prototype marks it but does not execute it yet.)* | yes |

Rejection, expiry and blocks are **normal outcomes**, so they are returned, not thrown. Use `isConfirmed(result)` to check for success.

## API

### `new Nod({ apiUrl, agentKey, timeoutMs?, retries?, fetch? })`

| Method | |
|---|---|
| `Nod.pair(apiUrl, code, name)` | Redeem a pairing code. Returns `{ agentId, apiKey }` once. |
| `Nod.checkServer(apiUrl)` | Confirm an address is a compatible Nod backend. Throws a clear error if not. `Nod.pair` does this for you. |
| `nod.me()` | This agent's `name`, `frozen`, and the user's `policy` limits. Check limits before proposing. |
| `nod.propose(input)` | Submit a transaction. Returns the new `Proposal`. |
| `nod.proposeAndWait(input, opts?)` | Propose, then wait for a final outcome. |
| `nod.waitForResult(id, opts?)` | Poll until final. `opts`: `intervalMs`, `timeoutMs` (default 5 min), `signal`, `onUpdate`. |
| `nod.get(id)` | Fetch one proposal. |
| `nod.proposals({ limit })` | This agent's recent proposals, newest first. |

`ProposeInput`:

```ts
{
  transaction: string | Uint8Array | { serialize(): Uint8Array },  // base64, bytes, or a web3.js transaction
  reason?: string,        // shown to the user as "agent says", never treated as verified
  intent?: Intent,        // what you claim it does; the phone checks it (see below)
  cluster?: "devnet" | "mainnet-beta",
  idempotencyKey?: string // generated for you if omitted
}
```

The transaction must be **unsigned**, with the **user's wallet as fee payer**. The user's wallet signs it; your agent never does. A blockhash is attached again right before signing, so you don't need to worry about it expiring while the user decides.

### Transaction helpers: `nod-sdk/solana`

```ts
transferSol({ connection, from, to, sol, cluster? })
  // → { transaction, intent: { sol, recipient }, cluster }

jupiterSwap({ owner, inputMint, outputMint, amount, slippageBps? = 50 })
  // → { transaction, intent: { swap: {...} }, cluster: "mainnet-beta", quote }
```

Spread the result into `propose`. Because the helpers fill in `intent`, the phone can show a green **"Matches what the agent said"** badge.

### Intent: say what you mean, get checked

```ts
intent: { sol: 0.05, recipient: "…" }
intent: { swap: { inputMint, outputMint, inAmount: "10000000", minOut: "1095165" } }
```

The phone compares your claim with the decoded transaction. If an agent (or a prompt injection) says "pay 0.01 SOL" but the transaction sends 0.9 SOL, or promises a minimum output the swap doesn't enforce, the user sees a red **"Does not match what the agent said"** banner and must press and hold to continue. Always state your intent honestly; there is no benefit to leaving it out except losing the green badge.

### Idempotency

`propose` attaches an idempotency key automatically and reuses it across retries. To make a *business-level* operation safe to repeat (a cron job that might run twice, say), pass your own: `idempotencyKey: "invoice-2026-10-42"`. The same key returns the original proposal.

### Errors

All errors extend `NodError` (`.status`, `.details`).

| Class | When |
|---|---|
| `NodAuthError` | Key missing, wrong, revoked or rotated. Pair again or use the new key. |
| `NodRateLimitError` | Too many requests. `.retryAfterSeconds`. Retried for you up to `retries` times. |
| `NodTimeoutError` | A request, or the wait for a decision, took too long. |
| `NodNetworkError` | The backend could not be reached. Retried for you. |
| `NodError` | Anything else, such as `400` for an invalid request (`.details` lists the issues). |

Network errors, `429` and `5xx` are retried with backoff. `4xx` errors are not.

## CLI

```bash
nod pair <CODE> [--name NAME] [--api URL]   # get an agent key
nod whoami                                  # name, frozen?, limits
nod proposals [--limit N]                   # recent proposals
```

Reads `NOD_API_URL` and `NOD_AGENT_KEY` from the environment.

## Using it from an agent framework

Wrap one function as a tool and let the model call it. The model never sees the key, never builds raw transactions, and cannot get past the human.

```ts
const payVendor = {
  name: "pay_vendor",
  description: "Pay a vendor in SOL. A human must approve on their phone, so this can take up to a minute. It may be rejected.",
  parameters: { to: "string", sol: "number", reason: "string" },
  async run({ to, sol, reason }: { to: string; sol: number; reason: string }) {
    const built = await transferSol({ connection, from: USER_WALLET, to, sol });
    const r = await nod.proposeAndWait({ ...built, reason });
    return isConfirmed(r)
      ? `Paid. Signature ${r.signature}`
      : `Not paid: ${r.status}${r.blockReason ? ` (${r.blockReason})` : ""}. Do not retry unless the user asks.`;
  },
};
```

Tell the model plainly that a rejection is a decision, not an error to work around.

## Plain HTTP

Everything the SDK does is a small JSON API, fully specified in `docs/API.md` and `docs/openapi.yaml`. Authenticate with `Authorization: Bearer <agent key>`.

```bash
# Pair (no auth). The code comes from the Nod app.
curl -X POST $NOD/v1/pairings/redeem -H 'content-type: application/json' \
  -d '{"code":"AB12CD34","name":"my-agent"}'            # → {"agentId":"…","apiKey":"nodk_…"}

# Who am I, and what are my limits?
curl $NOD/v1/agent/me -H "authorization: Bearer $KEY"

# Propose. The Idempotency-Key header makes retries safe.
curl -X POST $NOD/v1/proposals -H "authorization: Bearer $KEY" \
  -H 'content-type: application/json' -H 'idempotency-key: job-7' \
  -d '{"transaction":"<base64 unsigned tx>","reason":"Weather API","intent":{"sol":0.05,"recipient":"…"},"cluster":"devnet"}'

# Poll for the outcome
curl $NOD/v1/proposals/<id> -H "authorization: Bearer $KEY"

# My recent proposals
curl "$NOD/v1/agent/proposals?limit=10" -H "authorization: Bearer $KEY"
```

Rate limits: 240 requests per minute per key by default; pairing is limited to 10 attempts per minute per address. A `429` response includes `retryAfter` in seconds.

## Security notes

- The agent key can only **propose**. It cannot move funds, change limits or read other agents' data.
- The user can **revoke or rotate** a key from the app at any time; the old key stops working immediately.
- Treat `NOD_AGENT_KEY` like a password: environment variable or secret store, never in source control or a prompt.
- `reason` is shown as "agent says" and is never trusted. Do not put secrets in it.
- This is prototype software and has not been independently audited. Use test funds.

## License

MIT
