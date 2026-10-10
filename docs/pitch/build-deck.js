const pptxgen = require("pptxgenjs");
const SKILL = process.env.PPTX_SKILL_DIR; // directory of the pptx skill that provides scripts/apply_theme.js
const { applyTheme } = require(SKILL + "/scripts/apply_theme.js");

// Same palette and type as the landing page (app/src/theme): dark #070606, lavender #99ACFF.
const THEME = {
  name: "Nod",
  headFontFace: "Plus Jakarta Sans",
  bodyFontFace: "Plus Jakarta Sans",
  colors: {
    dk1: "F3F2F2", lt1: "070606", dk2: "9C9A9A", lt2: "131212",
    accent1: "99ACFF", accent2: "4CD7A0", accent3: "F5B25B", accent4: "FF7A7A", accent5: "6C8CF7", accent6: "292727",
    hlink: "99ACFF", folHlink: "9C9A9A",
  },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.title = "Nod: nothing moves without your Nod";
pres.author = "Nod";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const MONO = "Geist Mono";
const SANS = "Plus Jakarta Sans";
const KNOT = "knot-lavender.png";

['Intro','Problem','Solution','Product','Solana','Architecture','Open','Status','Roadmap','Close'].forEach((t) => pres.addSection({ title: t }));
const X0 = 1.0, XW = 11.33; // content area inside the frame rules

pres.defineSlideMaster({
  title: "TITLE",
  background: { color: "070606" },
  objects: [],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: "070606" },
  objects: [
    { line: { x: 0.5, y: 0, w: 0, h: 7.5, line: { color: "292727", width: 0.75 } } },
    { line: { x: 12.833, y: 0, w: 0, h: 7.5, line: { color: "292727", width: 0.75 } } },
    { text: { text: "NOD  ·  NOTHING MOVES WITHOUT YOUR NOD", options: { x: 1.0, y: 6.95, w: 6, h: 0.3, fontFace: MONO, fontSize: 10, color: "9C9A9A", margin: 0, charSpacing: 1 } } },
  ],
  slideNumber: { x: 11.4, y: 6.95, w: 0.93, h: 0.3, fontFace: MONO, fontSize: 10, color: "9C9A9A", align: "right" },
});

function base(sectionTitle, notes) {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle });
  if (notes) s.addNotes(notes);
  return s;
}
function eyebrow(s, text) {
  s.addText(text.toUpperCase(), { x: X0, y: 0.7, w: 8, h: 0.3, fontFace: MONO, fontSize: 11, color: C.text2, charSpacing: 2, margin: 0, isTextBox: true, objectName: "Eyebrow" });
}
function title(s, runs, w) {
  s.addText(runs, { x: X0, y: 1.05, w: w || 10.4, h: 1.25, fontFace: SANS, fontSize: 34, color: C.text1, valign: "top", margin: 0, isTextBox: true, objectName: "Title" });
}
function card(s, x, y, w, h, o = {}) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: o.fill || C.background2 }, line: { color: o.line || C.accent6, width: 1 }, objectName: o.name || "Card" });
}
function label(s, text, x, y, w, color) {
  s.addText(text.toUpperCase(), { x, y, w, h: 0.3, fontFace: MONO, fontSize: 11, color: color || C.accent1, charSpacing: 2, margin: 0, isTextBox: true });
}
function dot(s, x, y, color, d = 0.14) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color }, line: { color, width: 0 } });
}

// 1. Title -----------------------------------------------------------------
{
  const s = pres.addSlide({ masterName: "TITLE", sectionTitle: "Intro" });
  s.addNotes("Nod is an approval layer for AI agents on Solana. The agent proposes, your phone decodes, you approve with your fingerprint, your wallet signs. Nothing moves without your Nod.");
  s.addImage({ path: KNOT, x: 7.5, y: 1.0, w: 6.4, h: 6.4, objectName: "Braille knot" });
  s.addText("CLOCK IN  ·  A SOLANA MOBILE HACKATHON", { x: 1.0, y: 1.0, w: 7, h: 0.3, fontFace: MONO, fontSize: 11, color: C.text2, charSpacing: 2, margin: 0, isTextBox: true });
  s.addText([
    { text: "Nothing moves", options: { breakLine: true } },
    { text: "without your " },
    { text: "Nod.", options: { color: C.accent1 } },
  ], { x: 1.0, y: 1.9, w: 7.2, h: 2.5, fontFace: SANS, fontSize: 48, bold: true, color: C.text1, valign: "top", margin: 0, isTextBox: true, objectName: "Title" });
  s.addText("The approval layer for AI agents on Solana.", { x: 1.0, y: 4.6, w: 5.8, h: 0.9, fontFace: SANS, fontSize: 20, color: C.text2, valign: "top", margin: 0, isTextBox: true });
  s.addText("ANDROID  ·  MOBILE WALLET ADAPTER  ·  DEVNET", { x: 1.0, y: 6.6, w: 7, h: 0.3, fontFace: MONO, fontSize: 11, color: C.text2, charSpacing: 2, margin: 0, isTextBox: true });
}

// 2. Problem -----------------------------------------------------------------
{
  const s = base("Problem", "AI agents are starting to pay for APIs, trade and rebalance. Today there are two bad options. Hot keys are fast but one injection can drain a wallet. Signing everything in a wallet UI is safe, but people approve opaque bytes. What is missing is a human in the loop that reads the transaction for you.");
  eyebrow(s, "01 · The problem");
  title(s, "Agents are starting to move money.");
  const cw = 5.5;
  [["Option A", C.accent4, "Give the agent a hot key", "Fast, but one prompt injection or bug can drain the wallet."],
   ["Option B", C.accent3, "Sign everything in a wallet", "Safe, but a wallet shows opaque bytes, so people tap approve without knowing what they sign."]].forEach((c, i) => {
    const x = X0 + i * (cw + 0.33);
    card(s, x, 2.6, cw, 2.7);
    dot(s, x + 0.35, 2.98, c[1]);
    label(s, c[0], x + 0.6, 2.9, 3, c[1]);
    s.addText(c[2], { x: x + 0.35, y: 3.5, w: cw - 0.7, h: 0.5, fontFace: SANS, fontSize: 22, color: C.text1, margin: 0, isTextBox: true });
    s.addText(c[3], { x: x + 0.35, y: 4.1, w: cw - 0.7, h: 1.0, fontFace: SANS, fontSize: 15, color: C.text2, valign: "top", margin: 0, isTextBox: true });
  });
  s.addText([
    { text: "What is missing: " , options: { color: C.accent1 } },
    { text: "a human in the loop that reads the transaction for you." },
  ], { x: X0, y: 5.75, w: XW, h: 0.9, fontFace: SANS, fontSize: 20, color: C.text1, valign: "top", margin: 0, isTextBox: true });
}

// 3. Solution: four steps ---------------------------------------------------
{
  const s = base("Solution", "Four steps. The agent proposes a transaction and a reason. Your phone decodes and simulates the real bytes. You approve with biometrics. Your own wallet signs over Mobile Wallet Adapter.");
  eyebrow(s, "02 · How Nod works");
  title(s, "Four steps between an agent and your money.");
  const w = 2.6, gap = 0.31;
  [["01", "The agent proposes", "Sends a transaction and a one-line reason. It never holds the key."],
   ["02", "Your phone decodes", "Reads the real bytes and simulates them locally."],
   ["03", "You give your Nod", "Fingerprint, face or screen lock. Reject or let it expire."],
   ["04", "Your wallet signs", "Over Mobile Wallet Adapter. Keys never enter Nod."]].forEach((c, i) => {
    const x = X0 + i * (w + gap);
    card(s, x, 3.0, w, 3.3);
    label(s, c[0], x + 0.3, 3.3, w - 0.6);
    s.addText(c[1], { x: x + 0.3, y: 3.95, w: w - 0.6, h: 0.9, fontFace: SANS, fontSize: 20, color: C.text1, valign: "top", margin: 0, isTextBox: true });
    s.addText(c[2], { x: x + 0.3, y: 4.9, w: w - 0.6, h: 1.25, fontFace: SANS, fontSize: 14, color: C.text2, valign: "top", margin: 0, isTextBox: true });
  });
}

// 4. What you see -----------------------------------------------------------
{
  const s = base("Product", "The approval card is built on the phone from the transaction itself, so it does not rely on the agent or the backend. You see who, how much, to whom, which program, and your balance before and after.");
  eyebrow(s, "03 · What you see");
  title(s, "Read what it really does.", 6.2);
  s.addText([
    { text: "Decoded from the transaction, not from the agent's description", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
    { text: "Simulated on your phone: your balance before and after", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
    { text: "The agent's stated intent is checked against what the transaction does", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
    { text: "A countdown, and a fresh check if the quote goes stale", options: { bullet: true } },
  ], { x: X0, y: 2.6, w: 5.6, h: 3.6, fontFace: SANS, fontSize: 16, color: C.text2, valign: "top", margin: 0, isTextBox: true });

  // the card
  const cx = 7.3, cy = 1.0, cw = 5.0;
  card(s, cx, cy, cw, 5.65, { name: "Approval card" });
  s.addText("demo-agent", { x: cx + 0.35, y: cy + 0.3, w: 2.5, h: 0.4, fontFace: SANS, fontSize: 16, color: C.text1, margin: 0, isTextBox: true });
  s.addText("EXPIRES IN 0:42", { x: cx + cw - 2.15, y: cy + 0.3, w: 1.8, h: 0.4, fontFace: MONO, fontSize: 10, color: C.accent3, align: "right", margin: 0, isTextBox: true });
  s.addText("wants to send", { x: cx + 0.35, y: cy + 0.95, w: 3, h: 0.35, fontFace: SANS, fontSize: 14, color: C.text2, margin: 0, isTextBox: true });
  s.addText([{ text: "0.05 ", options: {} }, { text: "SOL", options: { fontSize: 18, color: C.text2 } }], { x: cx + 0.35, y: cy + 1.3, w: 4, h: 0.8, fontFace: MONO, fontSize: 38, color: C.text1, margin: 0, isTextBox: true });
  [["To", "7xKX…9fQ2"], ["Program", "System Program"], ["Your balance", "1.2400 → 1.1900"]].forEach((r, i) => {
    const y = cy + 2.35 + i * 0.55;
    s.addShape(pres.ShapeType.line, { x: cx + 0.35, y, w: cw - 0.7, h: 0, line: { color: C.accent6, width: 1 } });
    s.addText(r[0], { x: cx + 0.35, y: y + 0.08, w: 2, h: 0.38, fontFace: SANS, fontSize: 14, color: C.text2, margin: 0, valign: "middle", isTextBox: true });
    s.addText(r[1], { x: cx + 2.0, y: y + 0.08, w: cw - 2.35, h: 0.38, fontFace: MONO, fontSize: 13, color: C.text1, margin: 0, align: "right", valign: "middle", isTextBox: true });
  });
  s.addShape(pres.ShapeType.line, { x: cx + 0.35, y: cy + 4.0, w: cw - 0.7, h: 0, line: { color: C.accent6, width: 1 } });
  dot(s, cx + 0.35, cy + 4.22, C.accent2, 0.13);
  s.addText("Matches what the agent said.", { x: cx + 0.62, y: cy + 4.1, w: cw - 1.0, h: 0.38, fontFace: SANS, fontSize: 14, color: C.text2, margin: 0, valign: "middle", isTextBox: true });
  s.addShape(pres.ShapeType.roundRect, { x: cx + 0.35, y: cy + 4.75, w: 1.45, h: 0.6, rectRadius: 0.08, fill: { color: C.background1 }, line: { color: C.accent6, width: 1 } });
  s.addText("REJECT", { x: cx + 0.35, y: cy + 4.75, w: 1.45, h: 0.6, fontFace: MONO, fontSize: 11, color: C.text1, align: "center", valign: "middle", margin: 0, charSpacing: 1, isTextBox: true });
  s.addShape(pres.ShapeType.roundRect, { x: cx + 1.95, y: cy + 4.75, w: cw - 2.3, h: 0.6, rectRadius: 0.08, fill: { color: C.accent1 }, line: { color: C.accent1, width: 0 } });
  s.addText("HOLD TO APPROVE", { x: cx + 1.95, y: cy + 4.75, w: cw - 2.3, h: 0.6, fontFace: MONO, fontSize: 11, color: C.background1, align: "center", valign: "middle", margin: 0, charSpacing: 1, isTextBox: true });
}

// 5. Claim vs reality --------------------------------------------------------
{
  const s = base("Product", "An agent can say anything. Nod compares what the agent claimed with what the transaction actually does. A mismatch is flagged before you ever reach an approve button, and anything over the hard cap is blocked automatically.");
  eyebrow(s, "04 · Decoded, not described");
  title(s, "The agent can say anything. The transaction cannot.");
  const cw = 5.5;
  card(s, X0, 2.75, cw, 2.3);
  label(s, "The agent says", X0 + 0.35, 3.05, 4, C.text2);
  s.addText("“Weather API credits”", { x: X0 + 0.35, y: 3.55, w: cw - 0.7, h: 0.5, fontFace: SANS, fontSize: 22, color: C.text1, margin: 0, isTextBox: true });
  s.addText("Pay 0.05 SOL", { x: X0 + 0.35, y: 4.15, w: cw - 0.7, h: 0.4, fontFace: SANS, fontSize: 15, color: C.text2, margin: 0, isTextBox: true });
  const rx = X0 + cw + 0.33;
  card(s, rx, 2.75, cw, 2.3, { line: C.accent4 });
  label(s, "The transaction does", rx + 0.35, 3.05, 4, C.accent4);
  s.addText("Sends 4.80 SOL", { x: rx + 0.35, y: 3.55, w: cw - 0.7, h: 0.5, fontFace: SANS, fontSize: 22, color: C.text1, margin: 0, isTextBox: true });
  s.addText("To 9bQr…T3mA, a recipient you never allowed", { x: rx + 0.35, y: 4.15, w: cw - 0.7, h: 0.7, fontFace: SANS, fontSize: 15, color: C.text2, valign: "top", margin: 0, isTextBox: true });
  card(s, X0, 5.3, XW, 0.95);
  dot(s, X0 + 0.35, 5.7, C.accent4);
  s.addText("Does not match. Over the hard cap, so it is blocked automatically.", { x: X0 + 0.65, y: 5.3, w: XW - 1.0, h: 0.95, fontFace: SANS, fontSize: 18, color: C.text1, valign: "middle", margin: 0, isTextBox: true });
  s.addText("Illustrative example.", { x: X0, y: 6.4, w: 4, h: 0.3, fontFace: MONO, fontSize: 10, color: C.text2, margin: 0, isTextBox: true });
}

// 6. Limits ------------------------------------------------------------------
{
  const s = base("Product", "Limits are set per agent, in the app, and enforced before anything reaches your phone. Auto for small expected payments, Nod for everything else, Block for what should never happen. On top: daily caps, allowed recipients, freeze and key revocation.");
  eyebrow(s, "05 · Your limits");
  title(s, "You decide how much trust an agent gets.");
  const w = 3.6, gap = 0.265;
  [["Auto", C.accent2, "Small and expected", "Under your limit, to allowed recipients. Goes through without a prompt."],
   ["Nod", C.accent1, "Everything else", "Larger amounts, new recipients, swaps. Your phone waits for your biometric."],
   ["Block", C.accent4, "Never allowed", "Unknown programs, authority changes, over the hard cap. Refused automatically."]].forEach((c, i) => {
    const x = X0 + i * (w + gap);
    card(s, x, 2.75, w, 2.65);
    dot(s, x + 0.35, 3.1, c[1]);
    label(s, c[0], x + 0.6, 3.02, 2.5, c[1]);
    s.addText(c[2], { x: x + 0.35, y: 3.55, w: w - 0.7, h: 0.5, fontFace: SANS, fontSize: 20, color: C.text1, margin: 0, isTextBox: true });
    s.addText(c[3], { x: x + 0.35, y: 4.15, w: w - 0.7, h: 1.1, fontFace: SANS, fontSize: 14, color: C.text2, valign: "top", margin: 0, isTextBox: true });
  });
  let cx = X0;
  [["Daily spend cap", 2.55], ["Allowed recipients", 2.95], ["Freeze in one tap", 2.8], ["Revoke keys any time", 3.0]].forEach((c) => {
    s.addShape(pres.ShapeType.roundRect, { x: cx, y: 5.85, w: c[1], h: 0.5, rectRadius: 0.25, fill: { color: C.background1 }, line: { color: C.accent6, width: 1 } });
    s.addText(c[0].toUpperCase(), { x: cx, y: 5.85, w: c[1], h: 0.5, fontFace: MONO, fontSize: 10, color: C.text2, align: "center", valign: "middle", margin: 0, charSpacing: 1, isTextBox: true });
    cx += c[1] + 0.15;
  });
}

// 7. Solana Mobile -----------------------------------------------------------
{
  const s = base("Solana", "Nod is built on the Solana Mobile stack. Mobile Wallet Adapter signing, any MWA wallet and Seed Vault on a Seeker, the Android biometric prompt, push with only a proposal id, local simulation, and Jupiter swap decoding on mainnet.");
  eyebrow(s, "06 · Built on Solana Mobile");
  title(s, "Native to Solana Mobile.");
  const w = 3.6, gap = 0.265;
  [["Mobile Wallet Adapter", "Signing in your own wallet. Keys never enter Nod."],
   ["Seed Vault ready", "Works with any MWA wallet, Seed Vault on a Seeker included."],
   ["Biometric gate", "Android system prompt with screen-lock fallback. Hold to approve."],
   ["Minimal push", "Notifications carry only a proposal id, never amounts."],
   ["Local simulation", "Decodes and simulates the exact bytes about to be signed."],
   ["Jupiter-aware", "Swaps are decoded from the route, on mainnet."]].forEach((c, i) => {
    const x = X0 + (i % 3) * (w + gap), y = 2.55 + Math.floor(i / 3) * 2.15;
    card(s, x, y, w, 1.95);
    dot(s, x + 0.35, y + 0.37, C.accent1);
    s.addText(c[0], { x: x + 0.6, y: y + 0.25, w: w - 0.9, h: 0.4, fontFace: SANS, fontSize: 17, color: C.text1, margin: 0, isTextBox: true });
    s.addText(c[1], { x: x + 0.35, y: y + 0.85, w: w - 0.7, h: 0.95, fontFace: SANS, fontSize: 14, color: C.text2, valign: "top", margin: 0, isTextBox: true });
  });
}

// 8. Architecture -------------------------------------------------------------
{
  const s = base("Architecture", "The backend is a messenger and a policy gate. It cannot sign. The phone decodes, simulates and verifies. Keys stay in the wallet. Everything that protects your money happens on the device.");
  eyebrow(s, "07 · Architecture");
  title(s, "How the pieces fit.");
  const w = 1.95, gap = 0.395;
  const parts = [["AI agent", "nod-sdk"], ["Nod backend", "policy + push"], ["Nod app", "decode, simulate, approve"], ["Wallet", "MWA or Seed Vault"], ["Solana", "RPC, programs"]];
  parts.forEach((p, i) => {
    const x = X0 + i * (w + gap);
    card(s, x, 2.75, w, 1.7, { line: i === 2 ? C.accent1 : C.accent6 });
    label(s, p[0], x + 0.2, 3.1, w - 0.4, i === 2 ? C.accent1 : C.text2);
    s.addText(p[1], { x: x + 0.2, y: 3.55, w: w - 0.4, h: 0.7, fontFace: SANS, fontSize: 14, color: C.text1, valign: "top", margin: 0, isTextBox: true });
    if (i < parts.length - 1) s.addText("›", { x: x + w, y: 3.2, w: gap, h: 0.6, fontFace: MONO, fontSize: 24, color: C.accent1, align: "center", valign: "middle", margin: 0, isTextBox: true });
  });
  [[1, "Never holds a key"], [2, "Verifies what it signs"], [3, "Keys stay here"]].forEach((n) => {
    const x = X0 + n[0] * (w + gap);
    s.addText(n[1], { x, y: 4.7, w, h: 0.7, fontFace: SANS, fontSize: 14, color: C.text2, valign: "top", margin: 0, isTextBox: true });
  });
  s.addText("The backend is a messenger and a policy gate, never the source of truth.", { x: X0, y: 5.75, w: XW, h: 0.9, fontFace: SANS, fontSize: 20, color: C.text1, valign: "top", margin: 0, isTextBox: true });
}

// 9. Open ----------------------------------------------------------------------
{
  const s = base("Open", "Anyone can run their own backend with one command and connect any agent through the SDK or plain HTTP. There is an OpenAPI spec and a conformance suite for other implementations. Everything is MIT licensed.");
  eyebrow(s, "08 · Open source");
  title(s, "Open, and yours to run.", 6.2);
  s.addText([
    { text: "npx nod-server: your own backend in one command", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
    { text: "--tunnel for a public https address", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
    { text: "SDK, OpenAPI spec and a conformance suite", options: { bullet: true, breakLine: true, paraSpaceAfter: 10 } },
    { text: "Docker image, MIT licensed", options: { bullet: true } },
  ], { x: X0, y: 2.6, w: 5.4, h: 3.2, fontFace: SANS, fontSize: 16, color: C.text2, valign: "top", margin: 0, isTextBox: true });
  card(s, 7.0, 2.2, 5.33, 4.1, { name: "Code card" });
  s.addText("agent.ts", { x: 7.3, y: 2.4, w: 3, h: 0.3, fontFace: MONO, fontSize: 10, color: C.text2, margin: 0, isTextBox: true });
  const code = [
    ["# run your backend", C.text2], ["npx nod-server --tunnel", C.text1], ["", C.text1],
    ["// propose from your agent", C.text2], ["const result = await nod", C.text1], ["  .proposeAndWait({", C.text1],
    ["    ...built,", C.text1], ['    reason: "Weather API credits",', C.accent2], ["  });", C.text1],
    ["if (isConfirmed(result))", C.accent1], ["  console.log(result.signature);", C.text1],
  ];
  s.addText(code.map((l, i) => ({ text: l[0] || " ", options: { color: l[1], breakLine: i < code.length - 1 } })),
    { x: 7.3, y: 2.85, w: 4.8, h: 3.2, fontFace: MONO, fontSize: 13, valign: "top", margin: 0, isTextBox: true, paraSpaceAfter: 2 });
}

// 10. Honest status -----------------------------------------------------------
{
  const s = base("Status", "This is a hackathon prototype. These pieces are confirmed on a real Android phone against devnet. It is not audited, and in this version auto-approved proposals are recorded but not executed by the backend.");
  eyebrow(s, "09 · Status");
  title(s, "Working on a real phone, and honest about the rest.");
  const w = 5.5;
  const cols = [
    ["Confirmed on device", ["Mobile Wallet Adapter authorize and sign", "Push notification on the lock screen", "Local decode and simulation with balance changes", "Biometric gate with screen-lock fallback"]],
    ["Also verified", ["Approval flow end to end", "Tamper demos: blocked programs, delegate, swapped transaction", "Activity feed with filters", "Demo agent proposing against devnet"]],
  ];
  cols.forEach((c, i) => {
    const x = X0 + i * (w + 0.33);
    card(s, x, 2.7, w, 2.95);
    label(s, c[0], x + 0.35, 2.95, w - 0.7);
    c[1].forEach((t, j) => {
      const y = 3.45 + j * 0.52;
      dot(s, x + 0.35, y + 0.13, C.accent2, 0.13);
      s.addText(t, { x: x + 0.65, y, w: w - 1.0, h: 0.45, fontFace: SANS, fontSize: 14, color: C.text1, valign: "middle", margin: 0, isTextBox: true });
    });
  });
  card(s, X0, 5.9, XW, 0.75);
  dot(s, X0 + 0.35, 6.2, C.accent3);
  s.addText("Prototype, not audited. Auto-approved proposals are recorded but not executed yet. Devnet by default.", { x: X0 + 0.65, y: 5.9, w: XW - 1.0, h: 0.75, fontFace: SANS, fontSize: 14, color: C.text1, valign: "middle", margin: 0, isTextBox: true });
}

// 11. Roadmap -----------------------------------------------------------------
{
  const s = base("Roadmap", "Next: Squads multisig and on-chain spending limits as the default treasury, and more program decoders. Later: iOS and hardware-key approvers, policy as code, agent reputation, and SKR integration for the Seeker ecosystem.");
  eyebrow(s, "10 · Roadmap");
  title(s, "Where it goes next.");
  const w = 3.6, gap = 0.265;
  [["Next", ["Squads multisig and on-chain spending limits", "More decoders: lending, staking, perps"]],
   ["Later", ["iOS and hardware-key approvers", "Policy as code, with simulation-based rules"]],
   ["Ecosystem", ["SKR integration for the Seeker ecosystem", "Agent reputation and audit exports"]]].forEach((c, i) => {
    const x = X0 + i * (w + gap);
    card(s, x, 2.7, w, 3.3);
    label(s, c[0], x + 0.35, 3.0, w - 0.7);
    c[1].forEach((t, j) => {
      const y = 3.6 + j * 1.15;
      dot(s, x + 0.35, y + 0.09, C.accent1, 0.12);
      s.addText(t, { x: x + 0.65, y, w: w - 1.0, h: 1.0, fontFace: SANS, fontSize: 16, color: C.text1, valign: "top", margin: 0, isTextBox: true });
    });
  });
}

// 12. Close -------------------------------------------------------------------
{
  const s = pres.addSlide({ masterName: "TITLE", sectionTitle: "Close" });
  s.addNotes("Close: nothing moves without your Nod. The app, the open-source backend and the SDK all exist today and run on devnet. Add the APK link, repository, demo video and docs.");
  s.addImage({ path: KNOT, x: 7.9, y: 1.4, w: 6.0, h: 6.0, objectName: "Braille knot" });
  s.addText("GET NOD", { x: 1.0, y: 1.2, w: 5, h: 0.3, fontFace: MONO, fontSize: 11, color: C.text2, charSpacing: 2, margin: 0, isTextBox: true });
  s.addText([
    { text: "Nothing moves", options: { breakLine: true } },
    { text: "without your " },
    { text: "Nod.", options: { color: C.accent1 } },
  ], { x: 1.0, y: 2.0, w: 7.0, h: 2.5, fontFace: SANS, fontSize: 48, bold: true, color: C.text1, valign: "top", margin: 0, isTextBox: true, objectName: "Title" });
  s.addText("An Android app, an open-source backend and an SDK. Running on Solana devnet.", { x: 1.0, y: 4.6, w: 5.8, h: 0.9, fontFace: SANS, fontSize: 18, color: C.text2, valign: "top", margin: 0, isTextBox: true });
  let cx = 1.0;
  [["APK", 1.2], ["Repository", 1.9], ["Demo video", 1.9], ["Docs", 1.2]].forEach((c) => {
    s.addShape(pres.ShapeType.roundRect, { x: cx, y: 5.9, w: c[1], h: 0.55, rectRadius: 0.08, fill: { color: C.background1 }, line: { color: C.accent6, width: 1 } });
    s.addText(c[0].toUpperCase(), { x: cx, y: 5.9, w: c[1], h: 0.55, fontFace: MONO, fontSize: 11, color: C.text1, align: "center", valign: "middle", margin: 0, charSpacing: 1, isTextBox: true });
    cx += c[1] + 0.15;
  });
}

(async () => {
  await pres.writeFile({ fileName: "nod-pitch-deck.pptx" });
  await applyTheme("nod-pitch-deck.pptx", THEME);
  console.log("written");
})();
