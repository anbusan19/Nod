import { Nod } from "@nod/sdk";
import { required } from "./env.js";

// usage: npm run pair -- <CODE> [agent-name]
const [code, name = "demo-agent"] = process.argv.slice(2);
if (!code) {
  console.error("usage: npm run pair -- <PAIRING_CODE> [agent-name]");
  process.exit(1);
}
const { agentId, apiKey } = await Nod.pair(required("NOD_API_URL"), code, name);
console.log(`Paired agent ${agentId}\nAdd to demo-agent/.env:\nNOD_AGENT_KEY=${apiKey}`);
