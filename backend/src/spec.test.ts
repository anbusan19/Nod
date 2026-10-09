// Keeps docs/openapi.yaml honest: it must describe exactly the routes and fields the backend really has.
import { Keypair } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildApp } from "./app.js";
import { API_VERSION } from "./config.js";
import { openDb } from "./db/index.js";
import { LogPushSender } from "./push/sender.js";
import { transferTx } from "./testutil.js";

const spec: any = parse(readFileSync(new URL("../../docs/openapi.yaml", import.meta.url), "utf8"));
const app = buildApp({ db: openDb(":memory:"), push: new LogPushSender(), getBlockhash: async () => "11111111111111111111111111111111" });
const METHODS = ["get", "post", "put", "patch", "delete"];

const call = async (method: string, url: string, token?: string, payload?: unknown) => {
  const r = await app.inject({ method: method as any, url, payload: payload as any, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return r.json() as any;
};

describe("docs/openapi.yaml matches the backend", () => {
  it("lists exactly the routes the backend serves", async () => {
    await app.ready();
    const served = new Set<string>(((app as any).nodRoutes as string[]).map((r) => r.replace(/:(\w+)/g, "{$1}")));
    const documented = new Set<string>();
    for (const [path, ops] of Object.entries<any>(spec.paths)) {
      for (const m of METHODS) if (ops[m]) documented.add(`${m.toUpperCase()} ${path}`);
    }
    expect([...documented].sort()).toEqual([...served].sort());
  });

  it("declares the same API version as the code", () => {
    expect(String(spec.info.version)).toBe(String(API_VERSION));
  });

  it("/health identifies a Nod backend and its API version", async () => {
    const h = await call("GET", "/health");
    expect(h).toMatchObject({ ok: true, service: "nod", apiVersion: API_VERSION });
    expect(Object.keys(h).sort()).toEqual(Object.keys(spec.paths["/health"].get.responses["200"].content["application/json"].schema.properties).sort());
  });

  it("real responses carry exactly the documented fields", async () => {
    const dev = await call("POST", "/v1/devices", undefined, {});
    const { code } = await call("POST", "/v1/pairings", dev.deviceToken);
    const agent = await call("POST", "/v1/pairings/redeem", undefined, { code, name: "spec-bot" });
    const payer = Keypair.generate();
    const created = await call("POST", "/v1/proposals", agent.apiKey, { transaction: transferTx(payer, Keypair.generate().publicKey, 1000), reason: "r", intent: { sol: 1e-6 } });

    const schemas = spec.components.schemas;
    const fields = (name: string) => Object.keys(schemas[name].properties).sort();

    // Proposal: same keys, in either direction (the create response adds the optional policyNote)
    const { policyNote, ...proposalOnly } = created;
    expect(Object.keys(proposalOnly).sort()).toEqual(fields("Proposal"));
    expect(typeof policyNote).toBe("string");
    expect(Object.keys(schemas.ProposalWithNote.allOf[1].properties)).toEqual(["policyNote"]);

    // the status and tier values the code produced are documented
    expect(schemas.ProposalStatus.enum).toContain(created.status);
    expect(schemas.Proposal.properties.tier.enum).toContain(created.tier);

    // AgentInfo and Policy
    const me = await call("GET", "/v1/agent/me", agent.apiKey);
    expect(Object.keys(me).sort()).toEqual(fields("AgentInfo"));
    expect(Object.keys(me.policy).sort()).toEqual(fields("Policy"));

    // AgentSummary as the phone sees it
    const [summary] = await call("GET", "/v1/agents", dev.deviceToken);
    expect(Object.keys(summary).sort()).toEqual(fields("AgentSummary"));

    // the phone's proposal list adds agentName
    const [listed] = await call("GET", "/v1/proposals", dev.deviceToken);
    expect(Object.keys(listed).sort()).toEqual([...fields("Proposal"), "agentName"].sort());

    // anything the schema marks required is present
    for (const key of schemas.Proposal.required) expect(created).toHaveProperty(key);
  });

  it("every status the code can produce is documented", () => {
    const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
    const union = /export type Status =([\s\S]*?);/.exec(store)![1];
    const inCode = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(inCode).toEqual([...spec.components.schemas.ProposalStatus.enum].sort());
  });
});
