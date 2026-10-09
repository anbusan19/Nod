import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getServerUrl, setReregisteredHandler, type Agent, type Proposal } from "./api/client";
import { tryNormalizeAddress } from "./solana/address";
import { decodeTransaction, deserialize } from "./solana/decode";
import { registerForPush } from "./push/notifications";
import { connectWallet, disconnectWallet } from "./solana/mwa";
import { kv } from "./storage";

interface AppState {
  ready: boolean;
  /** True until the user has told the app which Nod backend to use. */
  needsServer: boolean;
  error?: string;
  wallet?: string;
  proposals: Proposal[];
  agents: Agent[];
  openProposalId?: string;
  openProposal: (id?: string) => void;
  refresh: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Switch to another backend (or back to the built-in one with undefined). */
  changeServer: (url?: string) => Promise<void>;
  /** Destinations the user has already sent to via Nod. */
  knownRecipients: Set<string>;
}

const Ctx = createContext<AppState>(null as unknown as AppState);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [needsServer, setNeedsServer] = useState(false);
  const [error, setError] = useState<string>();
  const [wallet, setWallet] = useState<string>();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [openProposalId, openProposal] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([api.proposals(), api.agents()]);
      setProposals(p);
      setAgents(a);
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // If a server forgets this phone, the client registers again; send it the wallet address and push token again.
  useEffect(() => {
    setReregisteredHandler(async () => {
      const saved = tryNormalizeAddress(await kv.get("walletAddress"));
      if (saved) await api.updateDevice({ wallet: saved });
      await kv.remove("pushServer");
      await registerForPush();
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (!(await getServerUrl())) {
          setNeedsServer(true);
          return;
        }
        await api.ensureDevice();
        // Earlier builds stored the raw base64 form; normalize it (or drop it if unusable).
        const saved = tryNormalizeAddress(await kv.get("walletAddress"));
        setWallet(saved);
        if (saved) api.updateDevice({ wallet: saved }).catch(() => {});
        await refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setReady(true);
      }
    })();
  }, [refresh]);

  useEffect(() => {
    if (needsServer) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh, needsServer]);

  const connect = useCallback(async () => {
    const s = await connectWallet();
    setWallet(s.address);
    await api.updateDevice({ wallet: s.address }).catch(() => {});
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectWallet();
    setWallet(undefined);
  }, []);

  // Allowlisted recipients plus anyone a past confirmed proposal already paid.
  const changeServer = useCallback(
    async (url?: string) => {
      await api.setServer(url);
      setNeedsServer(!(await getServerUrl()));
      setProposals([]);
      setAgents([]);
      const saved = tryNormalizeAddress(await kv.get("walletAddress"));
      if (saved) api.updateDevice({ wallet: saved }).catch(() => {});
      await registerForPush().catch(() => {}); // the new server needs this phone's push token too
      await refresh();
    },
    [refresh],
  );

  const knownRecipients = useMemo(() => {
    const known = new Set<string>();
    for (const a of agents) a.policy?.allowedRecipients.forEach((r) => known.add(r));
    for (const p of proposals) {
      if (p.status !== "confirmed") continue;
      try {
        for (const ix of decodeTransaction(deserialize(p.transaction)).instructions) {
          if (ix.kind === "sol-transfer") known.add(ix.to);
          if (ix.kind === "spl-transfer") known.add(ix.destination);
        }
      } catch {
        // Transactions using lookup tables can't be decoded offline; skip them.
      }
    }
    return known;
  }, [agents, proposals]);

  const value = useMemo(
    () => ({ ready, needsServer, error, wallet, proposals, agents, openProposalId, openProposal, refresh, connect, disconnect, changeServer, knownRecipients }),
    [ready, needsServer, error, wallet, proposals, agents, openProposalId, refresh, connect, disconnect, changeServer, knownRecipients],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
