import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { api, type Proposal } from "../api/client";
import { Badge, Button, Card, Mono, T } from "../components/ui";
import { approve, prepare, type Prepared } from "../solana/approve";
import { formatSol, formatTokenAmount, shorten, type DecodedInstruction } from "../solana/decode";
import { PROGRAM_NAMES } from "../solana/programs";
import { useApp } from "../state";
import { useColors } from "../theme/colors";

function useCountdown(expiresAt: number) {
  const [left, setLeft] = useState(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))), 250);
    return () => clearInterval(t);
  }, [expiresAt]);
  return left;
}

function describe(ix: DecodedInstruction, owner: string): { title: string; lines: Array<[string, string]> } {
  switch (ix.kind) {
    case "sol-transfer":
      return { title: `Send ${formatSol(ix.lamports)}`, lines: [["To", ix.to], ["From", ix.from]] };
    case "spl-transfer":
      return {
        title: `Send ${formatTokenAmount(ix.amount, ix.decimals)} tokens`,
        lines: [["To", ix.destination], ["From", ix.source], ...(ix.mint ? ([["Mint", ix.mint]] as Array<[string, string]>) : [])],
      };
    case "spl-approve":
      return { title: "Grant spending authority", lines: [["Delegate", ix.delegate], ["Up to", ix.amount.toString()]] };
    case "spl-set-authority":
      return { title: `Change ${ix.authorityType} authority`, lines: [["Account", ix.account], ["New authority", ix.newAuthority ?? "none"]] };
    case "spl-close":
      return { title: "Close token account", lines: [["Account", ix.account], ["Rent to", ix.destination]] };
    case "create-account":
      return { title: `Create account (${formatSol(ix.lamports)} rent)`, lines: [["Account", ix.newAccount], ["Owner program", ix.owner]] };
    case "assign":
      return { title: "Reassign account to a program", lines: [["Account", ix.account], ["Program", ix.owner]] };
    case "create-ata":
      return { title: "Create token account", lines: [["For wallet", ix.wallet], ["Mint", ix.mint]] };
    case "swap":
      return { title: "Swap tokens", lines: [["Program", PROGRAM_NAMES["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"]]] };
    case "compute-budget":
      return { title: ix.detail, lines: [] };
    case "memo":
      return { title: "Memo on-chain", lines: [["Text", ix.text]] };
    case "unknown":
      return { title: "Unknown program", lines: [["Program", ix.programId]] };
  }
}

export function ProposalCard({ proposal: initial, onClose }: { proposal: Proposal; onClose: () => void }) {
  const c = useColors();
  const { wallet, knownRecipients, refresh, agents } = useApp();
  const [proposal, setProposal] = useState(initial);
  const [prepared, setPrepared] = useState<Prepared>();
  const [loadError, setLoadError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string }>();
  const left = useCountdown(proposal.expiresAt);
  const actionable = proposal.status === "awaiting_human" && left > 0 && !outcome;

  useEffect(() => {
    api.proposal(initial.id).then(setProposal).catch(() => {});
  }, [initial.id]);

  useEffect(() => {
    if (!wallet) return;
    prepare(proposal, wallet, knownRecipients)
      .then(setPrepared)
      .catch((e) => setLoadError((e as Error).message));
    // Decode once per proposal; later status changes must not re-simulate.
  }, [proposal.id, wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (actionable && left > 0 && left <= 10) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [left, actionable]);

  const onApprove = useCallback(async () => {
    if (!prepared || !wallet) return;
    setBusy(true);
    const r = await approve(prepared, wallet);
    setBusy(false);
    if (r.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setOutcome({ ok: true, text: `Confirmed. Signature ${shorten(r.signature, 6)}` });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setOutcome({ ok: false, text: r.reason });
    }
    refresh();
  }, [prepared, wallet, refresh]);

  const onReject = useCallback(async () => {
    setBusy(true);
    try {
      await api.reject(proposal.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setOutcome({ ok: false, text: "Rejected" });
      refresh();
    } catch (e) {
      setOutcome({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  }, [proposal.id, refresh]);

  const agentName = agents.find((a) => a.id === proposal.agentId)?.name ?? "Agent";
  const sol = prepared?.simulation.deltas.filter((d) => d.kind === "sol") ?? [];
  const tokens = prepared?.simulation.deltas.filter((d) => d.kind === "token") ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T size={24} weight="bold">Approval</T>
        <Button title="Close" kind="secondary" onPress={onClose} />
      </View>

      <Card style={{ alignItems: "center", gap: 4 }}>
        <T size={13} muted>{actionable ? "Expires in" : proposal.status.replace("_", " ")}</T>
        <Mono size={28} medium color={left <= 10 && actionable ? c.danger : c.text}>
          {actionable ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "—"}
        </Mono>
      </Card>

      <Card style={{ gap: 6 }}>
        <T size={13} muted>{agentName} says:</T>
        <T>{proposal.reason || "No reason given"}</T>
        <T size={12} muted>Written by the agent, not verified.</T>
      </Card>

      {!wallet && <Card><T>Connect your wallet in Settings to review and sign.</T></Card>}
      {wallet && !prepared && !loadError && <Card><T muted>Decoding and simulating on this phone…</T></Card>}
      {loadError && <Card><Badge label="Could not verify" tone="danger" /><T style={{ marginTop: 8 }}>{loadError}</T></Card>}

      {prepared && (
        <>
          {prepared.risks.length > 0 && (
            <View style={{ gap: 8 }}>
              {prepared.risks.map((r) => <Badge key={r.code} label={r.label} tone={r.severity === "danger" ? "danger" : "warn"} />)}
            </View>
          )}

          <Card style={{ gap: 14 }}>
            <T size={13} muted>What this transaction does</T>
            {prepared.decoded.instructions
              .filter((ix) => ix.kind !== "compute-budget")
              .map((ix, i) => {
                const d = describe(ix, wallet!);
                return (
                  <View key={i} style={{ gap: 4 }}>
                    <T size={18} weight="semibold">{d.title}</T>
                    {d.lines.map(([k, v]) => (
                      <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                        <T size={13} muted>{k}</T>
                        <Mono selectable>{ix.kind === "memo" ? v : shorten(v)}</Mono>
                      </View>
                    ))}
                  </View>
                );
              })}
          </Card>

          <Card style={{ gap: 8 }}>
            <T size={13} muted>Your balance changes (simulated)</T>
            {sol.length === 0 && tokens.length === 0 && <T>No balance changes found.</T>}
            {sol.map((d) => (
              <Mono key={d.account} size={20} medium color={d.delta < 0n ? c.danger : c.ok}>
                {d.delta > 0n ? "+" : ""}{formatSol(d.delta)}
              </Mono>
            ))}
            {tokens.map((d) => (
              <Mono key={d.account} size={16} medium color={d.delta < 0n ? c.danger : c.ok}>
                {d.delta > 0n ? "+" : ""}{d.delta.toString()} ({shorten(d.mint ?? "")}) raw units
              </Mono>
            ))}
          </Card>

          <Card style={{ gap: 4 }}>
            <T size={13} muted>Programs involved</T>
            {prepared.decoded.programs.map((p) => (
              <View key={p} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <T size={13}>{PROGRAM_NAMES[p] ?? "Unknown"}</T>
                <Mono>{shorten(p)}</Mono>
              </View>
            ))}
          </Card>

          {prepared.blockers.map((b) => (
            <Card key={b} style={{ backgroundColor: c.dangerBg, borderColor: c.danger }}><T style={{ color: c.danger }}>{b}</T></Card>
          ))}
        </>
      )}

      {outcome && (
        <Card style={{ backgroundColor: outcome.ok ? c.okBg : c.dangerBg }}>
          <T weight="semibold" style={{ color: outcome.ok ? c.ok : c.danger }}>{outcome.text}</T>
        </Card>
      )}

      {actionable && (
        <View style={{ gap: 10 }}>
          <Button title="Approve with biometrics" onPress={onApprove} loading={busy} disabled={!prepared || prepared.blockers.length > 0} />
          <Button title="Reject" kind="danger" onPress={onReject} disabled={busy} />
        </View>
      )}
    </ScrollView>
  );
}
