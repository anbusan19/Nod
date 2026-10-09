# Run your own Nod backend

Nod is composable: there is **no central server**. You run the small Nod backend (one Node service and one SQLite file), your phone's app connects to it, and your agents connect to it through the SDK. Nobody else is in the middle, and the backend never holds your keys.

```
 your agent ── nod-sdk ──▶ YOUR backend ◀── Nod app on your phone ──▶ your wallet app ──▶ Solana
```

One backend can serve several people (each phone sees only its own agents), so a team can share one, or everyone can run their own.

> **Status:** the container files were written and checked step by step (install, build, production start, safety guards) but the image itself has **not** been built with Docker yet. The first `docker build` is part of your verification.

## What you need

| Need | Why |
|---|---|
| A host that runs a container (or Node 24) | The service itself |
| A **persistent disk** mounted at `/data` | The SQLite database. Without it, every restart forgets all users and agents |
| **HTTPS** in front of it | Release builds of the app refuse plain `http://` |
| A **Firebase project** (optional, recommended) | Push notifications to the lock screen. Without it the app still works, but only while open (it polls every 4 s) |

Run **one instance only.** SQLite is a single-writer file; do not scale horizontally without moving to a client/server database first.

## The quickest way

```bash
npx nod-server
```

This creates its own data folder (`~/.nod`) and secret, and prints the address to enter in the app. It is enough for trying Nod and for a single person or team on a machine they control. For a server that stays up, use the sections below.

## 1. Configure

```bash
cp .env.production.example .env.production
openssl rand -hex 32          # paste as AGENT_API_KEY_SALT
```

`AGENT_API_KEY_SALT` is the one setting you must get right. It protects every agent key and device token. **Set it once and never change it:** changing it invalidates all of them. The server refuses to start in production with the default value.

Optional push notifications:

```bash
# Firebase console → Project settings → Service accounts → Generate new private key
base64 -i firebase-service-account.json | tr -d '\n'     # paste as FIREBASE_SERVICE_ACCOUNT_BASE64
```

## 2. Run

**Docker Compose (any VPS):**

```bash
docker compose up -d --build
curl http://localhost:3000/health        # {"ok":true,"cluster":"devnet"}
```

**Any container host** (Fly.io, Railway, Render, a Kubernetes pod, and so on): build the `Dockerfile` at the repository root, mount a volume at `/data`, set the variables from `.env.production`, expose port `3000`, and let the platform terminate HTTPS. Set `TRUST_PROXY=true` (the image already does) so rate limits see real client addresses.

**Without Docker:**

```bash
npm ci -w backend --ignore-scripts && npm run build -w backend
NODE_ENV=production DATABASE_URL=/var/lib/nod/nod.db AGENT_API_KEY_SALT=… node backend/dist/index.js
```

Put Caddy or nginx in front for HTTPS. Caddy needs two lines:

```
nod.example.com {
  reverse_proxy localhost:3000
}
```

## 3. Reach it from your phone (this needs HTTPS)

The app has no built-in server. On first launch it asks for yours, and you can change it any time under **Settings → Server**. Release builds accept only `https://` addresses, so your backend needs a TLS address. Pick whichever fits:

| Where it runs | How to get HTTPS |
|---|---|
| A VPS or cloud container | Caddy or the platform's own TLS (see above) |
| A laptop or home server | A tunnel, such as `cloudflared tunnel --url http://localhost:3000`, which prints a public `https://…` address (example only, not tested here), or Tailscale Funnel |
| Developing with a USB cable | Debug builds also accept `http://`. Run `adb reverse tcp:3000 tcp:3000` and enter `http://localhost:3000` |

Enter the address in the app. It checks `/health` before switching and refuses anything that does not answer like a Nod backend.

Choose the Solana cluster the app signs for at build time (`EXPO_PUBLIC_SOLANA_CLUSTER`, `devnet` by default).

## 4. Pair an agent

In the app: **Agents → Show pairing code**. Then:

```bash
npx nod-sdk pair <CODE> --name my-agent --api https://nod.example.com
```

The agent only ever needs two things: your backend's address and its own key.

## Operating it

- **Backups:** copy `/data/nod.db` while the service is running with `sqlite3 /data/nod.db ".backup /backups/nod-$(date +%F).db"`. It holds users' agents, limits and proposal history, but **no private keys**; those never leave the wallet app.
- **Upgrading:** rebuild and restart. New columns are added automatically on startup.
- **Logs:** standard output. Errors from unexpected failures print as `[error]`; invalid requests are answered with 400 and are not logged.
- **Abuse limits:** 240 requests per minute per key (`RATE_LIMIT_PER_MINUTE`), 10 pairing attempts and 20 device registrations per minute per address, 256 KB request bodies.
- **Revoking an agent:** the user does it from the app (Agents → Remove). The key stops working immediately.

## What the operator can and cannot see

Cannot: private keys, or move funds. The backend never signs anything, and the phone verifies the exact transaction it signs.

Can: the transactions agents propose, the reasons they give, which agents are paired to which device, and the Solana address each user connected. Run a backend you would be comfortable having that data on, and say so to your users.

## Known limits

- One instance, SQLite, no automatic failover.
- Proposals older than a few days stay in the database; there is no retention job yet.
- No operator dashboard or per-user admin tools.
- Not independently audited. Use test funds.
