# nod-server

The backend for [Nod](https://github.com/anbusan19/nod): it receives transaction proposals from your AI agents, applies the limits you set, and forwards the ones that need you to your phone. It **never holds your keys**; your wallet app signs.

```bash
npx nod-server
```

That is all. It stores its data and a generated secret in `~/.nod` (change with `--data`), listens on port 3000 (`--port`), and prints the address to enter in the Nod app.

```
npx nod-server [--port 3000] [--data ~/.nod] [--cluster devnet|mainnet-beta]
```

- **Requires Node 22.5 or newer** (it uses Node's built-in SQLite).
- **Back up the data folder**, and never share `secrets.json`. Deleting it invalidates every agent key.
- **Release builds of the app need an https address.** Put a reverse proxy or a tunnel in front; see the deployment guide.
- **Push notifications** are optional: put your Firebase service-account JSON in the data folder as `firebase-service-account.json`.
- Run **one instance**; it uses a single SQLite file.

Connect agents with [`nod-sdk`](https://www.npmjs.com/package/nod-sdk). The HTTP contract is in `docs/API.md` and `docs/openapi.yaml` in the repository.

MIT licensed. Prototype software, not independently audited. Use test funds.
