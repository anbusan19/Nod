# Nod for agents

Nod is an approval layer for Solana transactions. You propose a transaction. A human reads it on their phone, approves it with a fingerprint, face or screen lock, and their own wallet signs it. You never hold the key that moves funds. Nothing moves without their Nod.

This page is plain Markdown on purpose: read it, or fetch `/agents.md`.

## Rules

- Propose **unsigned** transactions only, with the human's wallet as fee payer.
- Your `reason` is shown to the human as "agent says". It is never trusted, so keep it accurate and short (280 characters at most).
- Send an `intent` that matches the transaction. The phone checks it, and a mismatch shows a red warning and needs a deliberate press-and-hold.
- Always send an `Idempotency-Key`. A retry with the same key returns the original proposal and does not notify the human again.
- Treat `blocked`, `rejected` and `expired` as final answers. Do not resubmit the same transaction to get around them.
- Keep your agent key secret. It is shown once, and the human can revoke it at any time.

## 1. Pair (once)

The human opens **Agents, then Show pairing code** in the Nod app. The code is 8 characters, lasts 5 minutes and works once. Exchange it for your key:

```bash
npx nod-sdk pair AB12CD34 --name my-agent --api https://your-nod-backend.example.com
# NOD_API_URL=https://your-nod-backend.example.com
# NOD_AGENT_KEY=nodk_...
```

Or over HTTP:

```http
POST /v1/pairings/redeem
{ "code": "AB12CD34", "name": "my-agent" }
-> { "agentId": "...", "apiKey": "nodk_..." }
```

## 2. Check the server

```http
GET /health
-> { "ok": true, "service": "nod", "apiVersion": 1, "cluster": "devnet" }
```

Refuse a server whose `service` is not `nod` or whose `apiVersion` you do not support.

## 3. Propose a transaction

```http
POST /v1/proposals
Authorization: Bearer nodk_...
Idempotency-Key: <unique per payment>
Content-Type: application/json

{
  "transaction": "<unsigned transaction, base64>",
  "reason": "Weather API credits",
  "intent": { "sol": 0.05, "recipient": "<address>" },
  "cluster": "devnet"
}
```

- `201`: a new proposal. `200` with header `idempotent-replay: true`: a retry, original returned.
- `intent` for a swap: `{ "swap": { "inputMint": "...", "outputMint": "...", "inAmount": "10000000", "minOut": "1095165" } }`.

## 4. Wait for the outcome

```http
GET /v1/proposals/{id}
Authorization: Bearer nodk_...
```

Poll with a short, growing delay until the status is final.

- `awaiting_human`: waiting for the person. Not final.
- `approved`, `submitted`: they said yes and it is on its way. Not final.
- `confirmed`: on-chain. Final. The response includes the signature.
- `failed`: submitted but the chain rejected it. Final.
- `auto_approved`: within the person's auto limit. Final.
- `rejected`: the person said no. Final.
- `expired`: nobody decided in time. Final.
- `blocked`: refused by the person's limits. Final. Read `blockReason`.

## 5. With the SDK

```ts
import { Nod, isConfirmed } from "nod-sdk";
import { transferSol } from "nod-sdk/solana";
import { Connection } from "@solana/web3.js";

const nod = new Nod({ apiUrl: process.env.NOD_API_URL!, agentKey: process.env.NOD_AGENT_KEY! });
const connection = new Connection("https://api.devnet.solana.com");

const built = await transferSol({ connection, from: "HUMAN_WALLET", to: "VENDOR", sol: 0.05 });
const result = await nod.proposeAndWait({ ...built, reason: "Weather API credits" });

if (isConfirmed(result)) console.log("paid", result.signature);
else console.log("not paid:", result.status, result.blockReason ?? "");
```

## What to expect

- **Auto, Nod, Block.** Small payments to allowed recipients can go through without a prompt. Larger amounts, new recipients, swaps and anything beyond plain SOL transfers need the person. Unknown programs, authority changes (token approve, setAuthority, system assign) and amounts over the hard cap are blocked.
- **Frozen agents.** If the person freezes you, every proposal is `blocked`.
- **Time.** A proposal waits for a decision for a limited time (90 seconds by default, set by the backend) and then reads as `expired`. The phone refreshes the blockhash itself, so you do not need to.
- **Rate limits.** 240 requests per minute per key by default. A `429` response includes `retryAfter` in seconds.
- **Errors.** `{ "error": "message" }`, and validation failures add `"issues"` with status `400`. A `401` means a missing, wrong or revoked key.

## Reference

- Contract and guarantees: `docs/API.md`
- Machine-readable spec: `docs/openapi.yaml`
- SDK: `nod-sdk` on npm
- Run your own backend: `npx nod-server --tunnel`
