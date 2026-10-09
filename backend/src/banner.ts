/**
 * The start-up screen of `npx nod-server`: the knot, the facts a person hosting Nod wants to see,
 * and how to connect. Pure functions, so the layout is testable and plain-text when colour is off.
 */

/** The knot as Braille dots (36 columns, from app/assets/icon.png). */
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

/** The same knot, larger, for wide terminals (56 columns by 28 rows). */
const LOGO_LARGE: string[] = [
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⠀⢀⣀⣁⣘⣈⣁⣉⢘⡁⡃⠙⢦⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡰⣿⢾⡿⣿⣿⢿⡷⣿⢿⠿⡿⣿⢶⡶⡠⢆⠞⠳⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣰⣿⣻⣟⠿⣣⣟⣿⣧⣻⣟⣼⣿⣛⣿⣿⣻⣿⣟⣣⣻⢟⣤⣣⣄⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⣯⣻⣿⣽⣯⣿⣽⣯⣿⣿⣽⣿⣿⣿⣿⣯⣿⣽⣯⣿⣽⣽⣯⣛⣽⣯⡀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⢀⠀⠀⡀⢀⠀⡀⢀⣐⣛⣺⣗⣿⣿⣿⣟⣿⣻⣟⡽⢿⠛⠓⠛⠛⠛⠛⢿⣺⣟⣟⣻⣻⣟⣿⣻⣟⡟⢂⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣤⣴⣮⣷⣴⣯⠪⠕⠙⢯⠻⣵⣿⣯⣿⣽⣯⣿⣿⣽⣮⣿⣕⡯⠁⠀⠀⠀⠀⠀⠀⠀⠀⠹⣿⣯⣵⣽⣯⣾⣽⣯⣧⠟⠀⠀",
  "⠀⠀⠀⠀⠀⠀⣠⢺⡗⣿⣮⣾⡗⣭⢢⣔⣴⣶⢢⡔⣶⢲⡶⡗⣯⠀⠀⠀⠀⠒⠐⣿⢻⣷⣆⣠⠀⠀⠀⠀⠀⠀⠀⠀⠒⣷⣪⢺⡗⠀⠈⠓⠁⠀⠂⠀",
  "⠀⠀⠀⠀⣠⣮⣿⣽⣯⣿⣿⣽⣯⣿⣽⣯⢿⡿⣽⣯⢿⡽⣍⢈⡉⣅⣠⢀⣤⣼⣯⣿⡽⠋⠉⠉⢱⣦⠀⠀⠀⠀⠀⠀⠉⣿⡽⣽⣯⠀⠀⣉⠈⠁⡁⠀",
  "⠀⠀⠀⢾⡶⡷⣾⢾⡷⣿⢾⢾⡱⣿⢞⡷⣱⣾⣾⡷⣿⢶⡶⡱⣤⢾⡷⣤⣿⣾⡿⣿⠆⠰⠀⠀⠀⠀⠱⢶⠀⠀⠀⠀⠰⣷⢾⢾⡷⣠⢆⡴⠀⠀⠆⠰",
  "⠀⢀⣿⣿⣿⣿⡿⣻⣟⢾⡷⣿⢞⣶⡱⠛⠟⠉⣹⣏⢿⣿⣿⣮⡿⣿⣏⢿⣿⣿⣿⣿⣷⣿⢾⡁⡀⢀⠀⠀⠙⢆⣀⢀⣿⣿⣷⣿⣿⣶⣿⣏⢀⡀⠁⠀",
  "⢠⡾⣿⢾⡷⡳⣿⢾⡷⣻⢟⠾⠛⠁⠀⠀⠀⢸⢾⡳⣻⢞⣿⡷⣿⣾⡇⠀⠀⠙⠳⠿⢞⡷⣻⣿⣦⡰⠀⠀⠀⠀⠙⢾⣷⡿⢾⣾⡷⣿⢾⡇⠀⠴⠀⠀",
  "⢸⣿⣿⣻⣟⢟⡣⣻⣟⣼⡃⠓⠀⠀⠀⠀⢘⣻⡻⢟⢼⡻⣿⣿⣿⡋⠀⠀⠀⠀⠀⠀⠀⠙⢿⡧⡻⣿⣿⣣⣛⢘⣿⡿⣟⣟⣻⣻⣟⠿⡃⣀⠘⠂⠀⠀",
  "⢸⡯⣿⢝⣯⡫⣟⢽⣿⣿⠁⠀⠀⠀⠀⠀⠠⣿⣽⡯⣿⣽⣿⣯⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠽⠯⣻⢿⣽⡿⣿⢽⡯⣿⣽⣽⡫⠀⠅⠤⠀⠀⠀⠀",
  "⣸⣟⣽⣫⣟⣝⣯⣻⣟⣿⠀⠀⠀⠀⠀⠀⢰⣿⣻⣟⣿⣫⣿⣟⣿⡃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢘⣽⣿⣿⣟⣿⣻⣟⣿⣫⣻⣝⠀⣣⠖⠀⠀⠀⠀",
  "⠉⢩⣻⣝⣭⣫⣝⡽⢯⣿⣷⣤⡀⠀⠀⠀⢠⣽⣿⣯⣿⣽⣭⣯⣿⡅⠀⠀⠀⠀⠀⠀⠀⠀⡀⢀⣴⣯⣯⣽⣭⣯⣿⣝⣯⣫⠝⣅⣨⠛⠁⠀⠀⠀⠀⠀",
  "⠀⠀⣿⢪⡖⡕⣮⢢⡔⣿⣿⡛⠓⣤⠀⠀⠘⣿⣾⡗⣿⣾⣟⣷⣿⠃⠀⠀⠀⠀⠀⣤⢠⣶⣿⣿⢫⣵⣿⢺⣲⡗⣯⢪⡗⣵⢢⠚⠁⣤⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠈⠹⣯⣮⡵⣽⣯⢾⡽⣿⣦⣤⡅⣨⣼⣿⣽⣿⣿⣽⣿⣯⣿⣵⣦⣤⣴⣼⣿⣿⣽⣿⣿⣿⣿⣯⣿⣿⣭⣯⡷⣵⣯⢮⡁⣅⠀⠀⡄⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠷⢾⢾⡷⣿⠚⢾⡿⣿⢾⡇⣵⣾⢾⡷⣿⢮⠶⡷⣿⣾⡷⣿⣿⢿⣷⣿⢿⡷⣿⣯⢾⡷⣷⣾⠿⣷⣿⢾⡷⡷⠆⢾⡇⠀⠆⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠹⣏⢾⡷⣿⢎⠶⡹⣿⢿⣿⡹⢏⣿⣿⠋⢈⣿⣹⣏⣿⣿⣿⣟⣿⡻⣿⣾⡿⡳⢎⢿⡻⠿⠉⣿⣹⣏⣿⡿⣻⣏⠀⠁⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠾⠱⣛⢞⡷⣿⢏⣾⡷⣻⢾⠶⠀⠙⢿⡷⣿⣏⢾⡷⣛⢾⡿⡹⠿⠞⠁⠀⠀⠀⠀⣿⢾⣿⣿⢾⢾⡷⠀⠆⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠛⠘⠣⢻⣟⣿⣻⣿⣜⣁⡘⣛⣼⣿⣋⣘⠛⠃⠀⠀⠀⠀⠀⠀⠀⠀⢀⡿⣃⣿⣿⣻⣿⠇⠀⡃⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠩⣿⢽⣿⡯⣿⢥⡬⣻⣍⠽⠫⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡨⣄⢽⡯⣿⣿⠅⠀⠀⠅⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠛⡻⣟⣟⣿⣻⣟⣿⣿⡀⠘⠉⡛⠓⣄⣀⣀⣀⣐⣣⣺⣟⣿⣫⣟⠿⠋⠀⢀⠿⠃⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠑⢭⣫⣿⣝⣯⣿⣿⣽⣦⣀⠁⠀⠉⠛⠝⢫⣿⣽⣭⣽⠗⠙⠋⠀⠀⠀⣨⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠑⣯⢪⡗⣽⣯⢺⡕⣭⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠊⠁⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠑⢯⣿⡷⣽⢮⢶⡵⢏⢀⠀⠀⢠⠈⠁⣄⠀⠀⡄⢩⢈⡅⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠋⢾⡵⣽⢦⡴⣵⣤⢦⡴⡴⠆⠶⡴⣤⠆⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠁⣉⠞⠳⠱⠎⢈⡱⠉⠈⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
];

const LOGO_WIDTH = 34;
const LOGO_LARGE_WIDTH = 56;
/** The large knot plus the text column needs about this much room. */
const MIN_WIDTH_FOR_LARGE_LOGO = 104;
/** Below this width the logo would wrap and wreck the layout, so only the text is shown. */
const MIN_WIDTH_FOR_LOGO = 78;

export interface BannerInfo {
  version: string;
  cluster: string;
  port: number;
  dataDir: string;
  pushOn: boolean;
  lan: string[];
}

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

export function renderBanner(info: BannerInfo, opts: { color: boolean; columns?: number }): string {
  const paint = (code: string, s: string) => (opts.color ? `${code}${s}${RESET}` : s);
  const columns = opts.columns ?? 80;
  const withLogo = columns >= MIN_WIDTH_FOR_LOGO;

  const urls = [`http://localhost:${info.port}`, ...info.lan.map((a) => `http://${a}:${info.port}`)];
  const text: string[] = [
    paint(BOLD + LAVENDER, "N O D"),
    paint(DIM, "Nothing moves without your Nod."),
    "",
    `${paint(DIM, "version  ")} ${info.version}`,
    `${paint(DIM, "network  ")} ${info.cluster}`,
    `${paint(DIM, "push     ")} ${info.pushOn ? "on" : "off (optional, see --help)"}`,
    `${paint(DIM, "data     ")} ${info.dataDir}`,
    "",
    paint(DIM, "Nod app, same Wi-Fi (debug builds)"),
    ...urls.map((u) => `  ${paint(LAVENDER, u)}`),
    paint(DIM, "Release builds need https:"),
    paint(DIM, "use a tunnel (docs/DEPLOY.md)"),
  ];

  const lines: string[] = [];
  if (withLogo) {
    const large = columns >= MIN_WIDTH_FOR_LARGE_LOGO;
    const logo = large ? LOGO_LARGE : LOGO;
    const width = large ? LOGO_LARGE_WIDTH : LOGO_WIDTH;
    const rows = Math.max(logo.length, text.length);
    const top = Math.max(0, Math.floor((logo.length - text.length) / 2));
    for (let i = 0; i < rows; i++) {
      const art = (logo[i] ?? "").padEnd(width, " ");
      const t = text[i - top] ?? "";
      lines.push(`${paint(LAVENDER, art)}  ${t}`.trimEnd());
    }
  } else {
    lines.push(...text);
  }
  return `\n${lines.join("\n")}\n\n${paint(DIM, "Requests are logged below. Press Ctrl+C to stop.")}\n`;
}

/** One request, one line: time, status, method, route pattern (never ids or tokens) and duration. */
export function formatRequestLog(
  r: { method: string; route: string; status: number; ms: number; at?: Date },
  color: boolean,
): string {
  const d = r.at ?? new Date();
  const time = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
  const code = r.status >= 500 ? "\x1b[31m" : r.status >= 400 ? "\x1b[33m" : "\x1b[32m";
  const paint = (c: string, s: string) => (color ? `${c}${s}${RESET}` : s);
  return `${paint(DIM, time)}  ${paint(code, String(r.status))}  ${r.method.padEnd(6)} ${r.route}  ${paint(DIM, `${Math.round(r.ms)}ms`)}`;
}
