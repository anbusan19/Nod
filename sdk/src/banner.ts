/**
 * The knot and wordmark `nod pair` prints, the same art as the nod-server start-up screen.
 * Pure functions so the layout is testable and plain text when colour is off.
 */

/** The knot as Braille dots (34 columns, from app/assets/icon.png). */
const LOGO: string[] = [
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⣀⣤⣥⣥⣭⣭⣬⣈⠢⢀⡀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣶⣿⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣧⣦⡀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣺⣿⣿⣿⣿⣿⣿⣿⣻⣿⣿⣗⣷⣿⣿⣯⣿⣦⠀⠀",
  "⠀⠀⠀⠀⠀⣀⣠⣴⢷⠴⠶⠞⠾⠶⢾⢿⠿⠿⠿⠿⣿⡿⠁⠀⠀⠀⠀⠉⠿⣿⣿⡿⢿⣿⠖⠀",
  "⠀⠀⠀⣠⣮⣿⣿⣿⣵⣿⣿⣯⣮⣿⡟⠵⡄⠀⣈⣬⣯⡿⠷⢦⡀⠀⠀⠀⠨⣿⣿⡇⠀⠅⠨⠀",
  "⠀⢀⣾⣿⣟⢿⣿⡿⡿⣿⣿⣿⣿⣷⣾⣧⣻⣧⣿⣿⣟⢐⣀⠈⠙⢶⡀⠀⢰⣿⣿⡧⣦⡂⢀⠐",
  "⢠⣿⣿⣿⣵⣿⣿⡯⠟⠋⠉⣴⣿⣿⣿⣯⣿⠋⠻⢿⣿⣿⣷⣆⡆⠀⠙⢦⣾⣿⣿⣿⣿⠂⡂⠀",
  "⢸⣿⣿⡿⡿⣿⡏⠁⠀⠀⠨⡿⡿⣿⣿⣿⡏⠀⠀⠀⠀⠙⠿⢿⢿⣷⣭⡿⣿⣿⣿⡟⠏⠄⠀⠀",
  "⣸⣿⣿⣯⣪⣿⡇⠀⠀⠀⢨⣿⣿⣿⣿⣿⡅⠀⠀⠀⠀⠀⠀⠉⣵⣿⣿⣯⣯⣿⣷⡇⣅⠅⠀⠀",
  "⠉⢿⣿⣟⢟⢻⣿⣦⡀⠀⢰⣟⣿⣿⣿⣿⡇⠀⠀⠀⠀⢠⣤⣾⣻⣿⣿⣟⢟⣟⣣⠞⠁⠀⠀⠀",
  "⠀⠘⢿⣗⣕⣿⣿⣧⣈⣂⣲⣟⣷⣿⣿⣿⣢⣀⣤⣶⣷⣿⣿⣿⣻⣾⣿⣗⣕⣟⣃⠈⡀⠀⠀⠀",
  "⠀⠀⠀⠙⠿⣿⣏⣽⢿⣿⣿⡿⣿⣿⡿⢿⢿⣿⣿⣿⣿⣿⣿⣿⢿⣿⡿⡿⡿⣧⣼⡄⠄⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠈⠙⠗⢕⣿⣿⣯⣮⣿⡇⡙⢿⣿⣿⣿⣻⡾⡿⠗⠁⠁⠀⣯⣿⣿⣿⠇⡄⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠈⠉⢻⣿⣿⣷⣊⣿⣛⢾⠉⠀⠀⠀⠀⠀⢐⢛⣾⣿⡟⠀⡃⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢻⣿⣿⣾⣿⣿⡐⢑⠲⣤⣤⣤⣶⣿⣷⣵⠟⠁⡰⠂⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⢿⢽⢿⣿⡿⡢⠀⠀⠉⠉⠉⠉⠁⠁⠀⠴⠃⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⢽⣿⣯⡮⢪⡄⠀⡄⠁⠄⠠⠨⡬⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠋⠛⢻⠿⠿⠛⡧⠛⠋⠀⠀⠀⠀⠀⠀⠀⠀",
];

const LOGO_WIDTH = 34;
/** Below this width the logo would wrap and wreck the layout, so only the text is shown. */
const MIN_WIDTH_FOR_LOGO = 70;

/** "NOD" in the outlined block style of terminal installers. */
const WORDMARK: string[] = [
  "███╗   ██╗ ██████╗ ██████╗ ",
  "████╗  ██║██╔═══██╗██╔══██╗",
  "██╔██╗ ██║██║   ██║██║  ██║",
  "██║╚██╗██║██║   ██║██║  ██║",
  "██║ ╚████║╚██████╔╝██████╔╝",
  "╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ",
];

const LAVENDER = "\x1b[38;2;153;172;255m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

/** Colour only for a real terminal that did not opt out (https://no-color.org). */
export function supportsColor(stream: { isTTY?: boolean } = process.stdout, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.FORCE_COLOR === "0") return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "") return true;
  return Boolean(stream.isTTY) && env.TERM !== "dumb";
}

export interface PairBannerInfo {
  agentName: string;
  agentId: string;
  api: string;
}

/** The knot beside the wordmark and the facts of a fresh pairing. The key is never part of the banner. */
export function renderPairBanner(info: PairBannerInfo, opts: { color: boolean; columns?: number }): string {
  const paint = (code: string, s: string) => (opts.color ? `${code}${s}${RESET}` : s);
  const columns = opts.columns ?? 80;
  const withLogo = columns >= MIN_WIDTH_FOR_LOGO;

  const text: string[] = [
    ...(columns >= 40 ? WORDMARK.map((l) => paint(BOLD + LAVENDER, l)) : [paint(BOLD + LAVENDER, "N O D")]),
    "",
    paint(DIM, "Nothing moves without your Nod."),
    "",
    `${paint(DIM, "agent    ")} ${info.agentName}`,
    `${paint(DIM, "id       ")} ${info.agentId}`,
    `${paint(DIM, "server   ")} ${info.api}`,
    "",
    paint(LAVENDER, "Paired. Its key is shown below, once."),
  ];

  const lines: string[] = [];
  if (withLogo) {
    const rows = Math.max(LOGO.length, text.length);
    const top = Math.max(0, Math.floor((LOGO.length - text.length) / 2));
    for (let i = 0; i < rows; i++) {
      const art = (LOGO[i] ?? "").padEnd(LOGO_WIDTH, " ");
      lines.push(`${paint(LAVENDER, art)}  ${text[i - top] ?? ""}`.trimEnd());
    }
  } else {
    lines.push(...text);
  }
  return `\n${lines.join("\n")}\n`;
}
