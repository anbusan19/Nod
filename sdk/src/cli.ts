#!/usr/bin/env node
import { Nod } from "./client.js";
import { NodError } from "./errors.js";

const HELP = `nod: connect an agent to Nod

  nod pair <CODE> [--name NAME] [--api URL]   Redeem the code shown in the Nod app. Prints the agent key.
  nod whoami                                  Show this agent's name, status and limits.
  nod proposals [--limit N]                   List this agent's recent proposals.

Settings (flags or environment):
  --api URL     or NOD_API_URL      Nod backend, such as https://api.example.com
  NOD_AGENT_KEY                     The key printed by "nod pair"
`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const api = flag(rest, "api") ?? process.env.NOD_API_URL;

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") return void console.log(HELP);
  if (!api) throw new NodError("Set the backend with --api URL or NOD_API_URL.");

  if (cmd === "pair") {
    const code = rest.find((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--"));
    if (!code) throw new NodError("Usage: nod pair <CODE> [--name NAME]. The code is shown in the Nod app under Agents.");
    const { agentId, apiKey } = await Nod.pair(api, code, flag(rest, "name") ?? "my-agent");
    console.log(`Paired agent ${agentId}\n\nAdd this to your agent's environment (keep it secret):\n\nNOD_API_URL=${api}\nNOD_AGENT_KEY=${apiKey}`);
    return;
  }

  const key = process.env.NOD_AGENT_KEY;
  if (!key) throw new NodError("Set NOD_AGENT_KEY. Run `nod pair <CODE>` to get one.");
  const nod = new Nod({ apiUrl: api, agentKey: key });

  if (cmd === "whoami") {
    const me = await nod.me();
    const sol = (l: number) => `${l / 1e9} SOL`;
    console.log(`${me.name}${me.frozen ? "  (FROZEN: every proposal is blocked)" : ""}`);
    console.log(`  auto-approve up to  ${sol(me.policy.autoLimitLamports)}`);
    console.log(`  hard cap per tx     ${sol(me.policy.hardCapLamports)}`);
    console.log(`  daily cap           ${sol(me.policy.dailyCapLamports)}`);
    console.log(`  allowed recipients  ${me.policy.allowedRecipients.length}`);
    return;
  }
  if (cmd === "proposals") {
    for (const p of await nod.proposals({ limit: Number(flag(rest, "limit") ?? 10) })) {
      console.log(`${new Date(p.createdAt).toISOString()}  ${p.status.padEnd(14)} ${p.cluster.padEnd(12)} ${p.reason || "(no reason)"}${p.signature ? `  ${p.signature.slice(0, 12)}…` : ""}`);
    }
    return;
  }
  throw new NodError(`Unknown command "${cmd}". Run \`nod help\`.`);
}

main().catch((e) => {
  console.error(e instanceof NodError ? `Error: ${e.message}` : e);
  process.exit(1);
});
