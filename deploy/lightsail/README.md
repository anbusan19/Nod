# Deploy the Nod backend on AWS Lightsail

One small server runs the backend (Docker) behind Caddy, which provides HTTPS. About 15 minutes.

## 1. Create the server
1. Lightsail → **Create instance** → Linux/Unix → **OS only: Ubuntu 24.04** → the **$5 or $7 plan** (1 GB RAM is enough; use 2 GB if the build runs out of memory).
2. After it starts: **Networking** → **Create static IP** and attach it (so the address survives restarts).
3. **Networking → IPv4 Firewall**: keep SSH (22), add **HTTP 80** and **HTTPS 443**. Do not open 3000.

## 2. Pick the address
- **With a domain:** add an `A` record pointing at the static IP, e.g. `nod.example.com`.
- **Without a domain:** use a wildcard DNS name built from the IP, e.g. static IP `13.234.1.2` becomes `13-234-1-2.sslip.io`. No setup needed; Caddy can get a certificate for it.

## 3. Install Docker and get the code (on the server, over SSH)
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
git clone https://github.com/anbusan19/Nod.git && cd Nod
```
(The repository must be public, or clone with a token.)

## 4. Configure
```bash
cp .env.production.example .env.production
sed -i "s/^AGENT_API_KEY_SALT=.*/AGENT_API_KEY_SALT=$(openssl rand -hex 32)/" .env.production
```
Push notifications (optional): on your Mac, `base64 -i firebase-service-account.json | tr -d '\n'`, then paste the result after `FIREBASE_SERVICE_ACCOUNT_BASE64=` in `.env.production` on the server (`nano .env.production`). This file is a secret: never commit it, never paste it in a chat.

Back up the salt. Changing it later invalidates every agent key and device token.

## 5. Start
```bash
cd deploy/lightsail
NOD_DOMAIN=13-234-1-2.sslip.io docker compose up -d --build
docker compose logs -f caddy nod      # wait for "certificate obtained" and the backend listening
curl https://13-234-1-2.sslip.io/health
```
`/health` should return `{"ok":true,"service":"nod",...}`.

## 6. Use it
In the Nod app: connect to `https://<your-domain>`, then pair an agent (see `docs/DEPLOY.md`, "Pair an agent").

## Operating it
- **Update:** `git pull && docker compose up -d --build` in `deploy/lightsail`.
- **Logs:** `docker compose logs -f nod`.
- **Back up the database:** `docker run --rm -v lightsail_nod-data:/data -v $PWD:/out busybox tar czf /out/nod-data.tgz /data` (the volume name is `<folder>_nod-data`; check with `docker volume ls`).
- **Cost:** the instance plan only. Traffic for a demo is far below the included transfer.
