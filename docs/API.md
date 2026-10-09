# Nod API

This is the contract between three parties:

| Party | Role | Talks to the backend with |
|---|---|---|
| **Agent** | Proposes transactions | An **agent key** (`nodk_…`), through `nod-sdk` or plain HTTP |
| **Phone app** | Shows decoded proposals, signs through the user's wallet app | A **device token** (`nodd_…`) |
| **Backend** | Routes proposals, applies the user's limits, sends push | Nothing else; it never holds a signing key |

`openapi.yaml` (next to this file) defines every route, field and status code in machine-readable form. **This document says what the OpenAPI file cannot:** what each party may rely on. A test (`backend/src/spec.test.ts`) fails if the spec and the reference backend ever disagree.

You can swap in your own backend, your own agent client, or your own app, as long as you follow this contract. The reference backend lives in `backend/`.

## Conventions

- JSON over HTTPS. Bodies are limited to 256 KB.
- Authenticate with `Authorization: Bearer <token>`. An agent key or device token is shown **once**, when it is created, and stored only as a salted hash.
- Times are Unix **milliseconds**.
- Errors are `{ "error": "message" }`. Validation failures add `"issues": ["path: problem", …]` and use status `400`. Rate limits use `429` with `"retryAfter"` in seconds.
- `401` means a missing, wrong, revoked or rotated credential, and is decided **before** anything else, so a caller without valid credentials learns nothing about which ids exist. `404` is returned both for "no such thing" and "not yours", so one user cannot probe for another's data. `409` means the proposal is in the wrong state.

### Versioning

`GET /health` returns `{ ok, service: "nod", apiVersion, cluster }`.

- Clients must refuse a server whose `service` is not `"nod"` or whose `apiVersion` they do not support, and say which side to update (the reference SDK and app do).
- `apiVersion` is bumped only for changes an older client cannot cope with. New optional fields and new endpoints are **not** breaking: clients must ignore fields they do not know.

## The life of a proposal

```
agent: POST /v1/proposals ─┬─ policy blocks it ──────────────▶ blocked                        (final)
                           ├─ within the user's auto limit ──▶ auto_approved                  (final)
                           └─ needs the user ────────────────▶ awaiting_human ──push──▶ phone
                                                                   │
                         ┌─────────────── user rejects ────────────┤──▶ rejected               (final)
                         │                 nobody decides ─────────┤──▶ expired                (final)
                         └──── phone: refresh, sign, submit ───────┴──▶ approved → submitted → confirmed | failed
```

1. **Pairing.** The phone calls `POST /v1/pairings` and shows an 8-character code (valid 5 minutes, single use). The agent exchanges it at `POST /v1/pairings/redeem` for its key.
2. **Propose.** The agent sends an **unsigned** transaction with the user's wallet as fee payer, an optional `reason` (shown as "agent says", never trusted), an optional `intent`, and an `Idempotency-Key`.
3. **Decide.** The backend inspects the transaction and applies the agent's policy. If a human is needed, it sends a push containing **only the proposal id**.
4. **Review.** The phone fetches the proposal and **decodes and simulates the transaction itself**. It does not trust the backend's, or the agent's, description.
5. **Refresh.** After the user authenticates, the phone calls `POST …/refresh` for a fresh blockhash (a blockhash lives only about 36 seconds on devnet). It verifies that nothing but the blockhash changed.
6. **Sign and report.** The user's wallet app signs. The phone reports `approved`, then `confirmed` with the signature, or `failed`, via `POST …/result`.
7. **Result.** The agent polls `GET /v1/proposals/{id}` until the status is final.

A proposal that stays `awaiting_human` past `expiresAt` **reads as `expired`**, whether or not anything has written that to storage.

## What a backend must preserve

A client may rely on all of these. A backend that breaks one breaks the app's safety checks.

**Keys**
1. The backend **never holds or uses a key that can move the user's funds**, and never signs a transaction.
2. Agent keys and device tokens are random, stored only as salted hashes, and shown once. Pairing codes are short-lived (5 minutes) and single-use. Revoking an agent makes its key fail with `401` **immediately** and rejects whatever it still has waiting. Rotating a key invalidates the old one immediately.

**Integrity of what the user approves**
3. `txHash` is the **lowercase hex SHA-256 of the transaction's raw bytes**.
4. `POST …/result` must refuse (`409`) a `txHash` that is not the proposal's current one. This is how the backend learns the phone signed exactly what it was holding.
5. `POST …/refresh` may change **only the recent blockhash**: same fee payer, accounts and instructions. It must refuse (`409`) unless the proposal is `awaiting_human` and the transaction is still unsigned. It returns the new `transaction` and `txHash`.
6. The push payload carries only the proposal id. No amounts, recipients or reasons leave the backend through the push provider.

**Limits** (the user sets them; the backend enforces them before any push is sent)
7. A **frozen** agent has every proposal `blocked`.
8. A proposal is `blocked` if it: uses a program outside the known set and the policy does not allow unknown programs; grants spending authority or changes an authority (token `approve`, `setAuthority`, system `assign`); exceeds the **hard cap**; or would push the agent past its **daily cap**.
9. Swaps, anything beyond plain SOL transfers, lookup-table transactions, new recipients, and amounts over the **auto limit** need the human. Only a transaction made solely of plain SOL transfers (plus compute-budget or memo instructions), to allowlisted recipients and within the auto limit, can be `auto_approved`.
10. `auto_approved` is a final status. (The reference backend records it but does not execute the transaction yet.)

**Isolation**
11. A phone sees only the agents paired to it; an agent sees only its own proposals. Other users' resources answer `404`.
12. Requests with the same `Idempotency-Key` from the same agent return the **original** proposal (`200`, header `idempotent-replay: true`) and do not push again.

**Abuse limits** (the reference backend's defaults; yours may differ)
13. 240 requests per minute per key, 10 pairing attempts and 20 device registrations per minute per address.

## What a backend is *not* trusted for

The phone does not rely on the backend for anything that protects the user's money. It independently:

- **verifies** the transaction bytes against the proposal's hash,
- **decodes** every instruction and **simulates** the transaction on the right cluster,
- **checks the agent's `intent`** against the decoded transaction, and warns on any mismatch,
- **checks that a refreshed transaction** differs only in its blockhash,
- **checks that the wallet-signed transaction** matches what the user reviewed (tolerating only compute-budget and Lighthouse instructions and a capped priority fee) before submitting it.

So a hostile or buggy backend can **refuse service or show the wrong list**, but it cannot make the phone sign something other than what is shown on the card. (It does see the transactions that agents propose; run a backend you are comfortable with.)

## `intent`

An agent may state what a transaction does, so the phone can check it:

```json
{ "sol": 0.05, "recipient": "…" }
{ "swap": { "inputMint": "…", "outputMint": "…", "inAmount": "10000000", "minOut": "1095165" } }
```

A mismatch (an amount that differs by more than rounding, a different recipient, a swap that accepts less than `minOut`) shows a red banner and requires a press-and-hold to continue. Backends store and return `intent` unchanged and do not interpret it.

## Implementing your own backend

1. Implement every route in `openapi.yaml` with the behaviours above.
2. Run the conformance suite against it (it creates test data, so use a test instance):

   ```bash
   git clone <repo> && cd nod && npm install
   NOD_CONFORMANCE_URL=https://your-backend npm run conformance -w sdk
   ```
3. Point the app at it (Settings → Server) and pair an agent.

The suite checks the agent's whole journey through the SDK: pairing, limits, proposing, deciding, idempotency, blocked outcomes and revocation. It assumes the reference policy defaults (a 1000 SOL proposal exceeds the hard cap).

## Changing the contract

1. Change `backend/`, `docs/openapi.yaml` and this file together; `spec.test.ts` will not pass otherwise.
2. If an existing client could break, bump `API_VERSION` in `backend/src/config.ts`, `SUPPORTED_API_VERSION` in the SDK and the app, and the `info.version` in `openapi.yaml`.
