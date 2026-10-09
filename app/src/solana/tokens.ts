import { PublicKey, type Connection } from "@solana/web3.js";
import { formatTokenAmount, shorten } from "./decode";

export interface TokenInfo {
  mint: string;
  /** Display symbol. Only set for tokens whose mint and decimals were verified on-chain. */
  symbol?: string;
  decimals?: number;
}

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/** Mints and decimals verified against mainnet. Anything else is shown by address. */
const KNOWN: Record<string, { symbol: string; decimals: number }> = {
  [WSOL_MINT]: { symbol: "SOL", decimals: 9 }, // wrapped SOL is shown as SOL
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", decimals: 6 },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT", decimals: 6 },
};

export function knownToken(mint: string): TokenInfo | undefined {
  const k = KNOWN[mint];
  return k ? { mint, ...k } : undefined;
}

/** Decimals for each mint: from the known list, else read from the mint account. */
export async function resolveTokens(connection: Connection, mints: string[]): Promise<Record<string, TokenInfo>> {
  const out: Record<string, TokenInfo> = {};
  const unknown: string[] = [];
  for (const m of new Set(mints)) {
    const k = knownToken(m);
    if (k) out[m] = k;
    else unknown.push(m);
  }
  await Promise.all(
    unknown.map(async (m) => {
      try {
        const acc = await connection.getParsedAccountInfo(new PublicKey(m));
        const data = acc.value?.data;
        const decimals = data && "parsed" in data ? (data.parsed?.info?.decimals as number | undefined) : undefined;
        out[m] = { mint: m, decimals };
      } catch {
        out[m] = { mint: m };
      }
    }),
  );
  return out;
}

/** "1.100668 USDC", or "1100668 units of EPjF…xyz" when the token's decimals are unknown. */
export function formatToken(raw: bigint, info: TokenInfo | undefined, mint?: string): string {
  const m = info?.mint ?? mint ?? "";
  if (info?.decimals === undefined) return `${raw} units of ${shorten(m)}`;
  const amount = formatTokenAmount(raw, info.decimals);
  return `${amount} ${info.symbol ?? shorten(m)}`;
}
