import { useEffect, useState } from "react";
import { View } from "react-native";
import type { Prepared } from "../solana/approve";
import { shorten } from "../solana/decode";
import { PROGRAM_NAMES } from "../solana/programs";
import { formatToken } from "../solana/tokens";
import { useColors } from "../theme/colors";
import { Badge, Card, Mono, T } from "./ui";

function useAge(since: number) {
  const [age, setAge] = useState(Math.max(0, Math.floor((Date.now() - since) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setAge(Math.max(0, Math.floor((Date.now() - since) / 1000))), 1000);
    return () => clearInterval(t);
  }, [since]);
  return age;
}

const duration = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`);
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <T size={13} muted>{label}</T>
      {mono ? <Mono selectable style={{ flexShrink: 1, textAlign: "right" }}>{value}</Mono> : <T size={13}>{value}</T>}
    </View>
  );
}

/** Plain-language summary of a Jupiter swap, built only from the decoded transaction. */
export function SwapCard({ prepared }: { prepared: Prepared }) {
  const c = useColors();
  const age = useAge(prepared.proposal.createdAt);
  const s = prepared.swap?.swap;
  if (!s) return null;
  const src = prepared.tokens[s.sourceMint];
  const dst = prepared.tokens[s.destinationMint];
  const exactIn = s.mode === "exact-in";

  const pay = exactIn ? formatToken(s.inAmount, src, s.sourceMint) : `up to ${formatToken(s.inLimit, src, s.sourceMint)}`;
  const receive = exactIn ? `at least ${formatToken(s.outLimit, dst, s.destinationMint)}` : `exactly ${formatToken(s.outAmount, dst, s.destinationMint)}`;
  const stale = age > 30;
  // If the output is not paid to the user's own account, "You receive" would be false.
  const elsewhere = prepared.risks.some((r) => r.code === "swap-output-elsewhere");
  const programs = prepared.simulation.programsInvoked.filter((p) => p !== "ComputeBudget111111111111111111111111111111");

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T size={18} weight="semibold">Swap on Jupiter</T>
        <Badge label={prepared.cluster === "mainnet-beta" ? "Mainnet" : "Devnet"} tone={prepared.cluster === "mainnet-beta" ? "warn" : "neutral"} />
      </View>

      <View style={{ gap: 2 }}>
        <T size={13} muted>You pay</T>
        <Mono size={24} medium color={c.danger}>{pay}</Mono>
        <T size={13} muted style={{ marginTop: 8 }}>{elsewhere ? "Paid out to someone else" : "You receive"}</T>
        <Mono size={24} medium color={elsewhere ? c.danger : c.ok}>{receive}</Mono>
        {elsewhere && <T size={13} style={{ color: c.danger }}>This output does not go to your wallet.</T>}
      </View>

      <View style={{ gap: 6 }}>
        <Row label={exactIn ? "Quoted output" : "Quoted input"} value={exactIn ? formatToken(s.outAmount, dst, s.destinationMint) : formatToken(s.inAmount, src, s.sourceMint)} />
        <Row label="Slippage tolerance" value={pct(s.slippageBps)} />
        <Row label="Platform fee" value={pct(s.platformFeeBps)} />
        <Row label="Route" value={`${s.routeSteps} step${s.routeSteps === 1 ? "" : "s"}`} />
        <Row label="Quote age" value={`${duration(age)}${stale ? " · prices may have moved" : ""}`} />
      </View>

      <T size={12} muted>
        The minimum is enforced by the swap itself: if the market moves beyond the slippage tolerance, the transaction fails and nothing is spent.
      </T>

      {programs.length > 0 && (
        <View style={{ gap: 4 }}>
          <T size={13} muted>Programs it touches (from simulation)</T>
          {programs.slice(0, 8).map((p) => (
            <View key={p} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T size={13}>{PROGRAM_NAMES[p] ?? "Other program"}</T>
              <Mono>{shorten(p)}</Mono>
            </View>
          ))}
          {programs.length > 8 && <T size={12} muted>and {programs.length - 8} more</T>}
        </View>
      )}
    </Card>
  );
}
