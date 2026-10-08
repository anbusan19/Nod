import { buildApp } from "./app.js";
import { config } from "./config.js";
import { openDb } from "./db/index.js";
import { createPushSender } from "./push/sender.js";

const db = openDb(config.dbPath);
const push = await createPushSender(config.firebaseServiceAccount);
const app = buildApp({ db, push });

await app.listen({ port: config.port, host: "0.0.0.0" });
console.log(`Nod backend listening on :${config.port} (${config.cluster})`);
