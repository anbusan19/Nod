export const PROGRAMS = {
  system: "11111111111111111111111111111111",
  token: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  ata: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  computeBudget: "ComputeBudget111111111111111111111111111111",
  memo: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  jupiter: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  squads: "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
} as const;

export const PROGRAM_NAMES: Record<string, string> = {
  [PROGRAMS.system]: "System Program",
  [PROGRAMS.token]: "SPL Token",
  [PROGRAMS.ata]: "Associated Token Account",
  [PROGRAMS.computeBudget]: "Compute Budget",
  [PROGRAMS.memo]: "Memo",
  [PROGRAMS.jupiter]: "Jupiter v6",
  [PROGRAMS.squads]: "Squads v4",
};
