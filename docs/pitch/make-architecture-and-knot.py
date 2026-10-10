import math, json
from PIL import Image, ImageDraw
import gifs
from gifs import (Canvas, font, mix, clamp, smooth, ease, save_gif, BG, CARD, CARD2, BORDER, TEXT, MUTED, ACC, OK, WARN, BAD, KNOT_ROWS, BITS, B8, OUT, SS)

W, H = 1600, 900
MH = 62  # module height
RY = lambda i: 244 + 80 * i

CONT = [
    ("agent", 50, 160, 220, 290, "AGENT", "your script or bot"),
    ("backend", 330, 160, 330, 460, "NOD BACKEND", "messenger and policy gate"),
    ("phone", 720, 160, 400, 600, "YOUR PHONE", "decodes, simulates, verifies"),
    ("wallet", 1180, 160, 370, 175, "WALLET", "keys live here"),
    ("solana", 1180, 375, 370, 250, "SOLANA", "devnet by default"),
]
def mod(c, row_y, name, sub, key):
    cx = {c_[0]: c_ for c_ in CONT}[c]
    return key, (c, cx[1] + 20, row_y, cx[3] - 40, name, sub)
M = dict([
    mod("agent", RY(0), "AI agent", "proposes, never signs", "agent"),
    mod("agent", RY(1), "nod-sdk", "propose and wait", "sdk"),
    mod("backend", RY(0), "Proposal API", "idempotent, rate limited", "api"),
    mod("backend", RY(1), "Policy engine", "tiers, caps, freeze", "policy"),
    mod("backend", RY(2), "Push sender", "FCM, proposal id only", "push"),
    mod("backend", RY(3), "Store", "SQLite, hashed keys", "store"),
    mod("phone", RY(0), "Push handler", "fetches the proposal", "handler"),
    mod("phone", RY(1), "Decoder", "reads the real instructions", "decoder"),
    mod("phone", RY(2), "Simulator", "balance before and after", "sim"),
    mod("phone", RY(3), "Approval card", "intent check, countdown", "card"),
    mod("phone", RY(4), "Biometric gate", "fingerprint, face, screen lock", "bio"),
    mod("phone", RY(5), "MWA client", "sign request, submit", "mwa"),
    ("w", ("wallet", 1200, 244, 330, "MWA wallet", "Phantom, Solflare, Seed Vault")),
    ("rpc", ("solana", 1200, 444, 330, "RPC", "simulate, submit, confirm")),
    ("prog", ("solana", 1200, 524, 330, "Programs", "System, SPL Token, Jupiter")),
])
def X0(k): return M[k][1]
def X1(k): return M[k][1] + M[k][3]
def T(k): return M[k][2]
def Bt(k): return M[k][2] + MH
def CY(k): return M[k][2] + MH / 2

STEPS = [
    ("1  Propose", "The agent sends an unsigned transaction and a one-line reason.", ["agent", "sdk", "api"],
     [(X1("sdk"), CY("sdk")), (300, CY("sdk")), (300, CY("api")), (X0("api"), CY("api"))]),
    ("2  Decide", "The backend checks the agent's limits: auto, needs a human, or blocked.", ["api", "policy"],
     [(X0("api") + 90, Bt("api")), (X0("api") + 90, T("policy"))]),
    ("3  Notify", "A push goes to the phone. It carries only the proposal id.", ["policy", "push", "handler"],
     [(X1("push"), CY("push")), (690, CY("push")), (690, CY("handler")), (X0("handler"), CY("handler"))]),
    ("4  Decode and simulate", "The phone reads the real transaction and simulates it on-chain.", ["handler", "decoder", "sim", "rpc"],
     [(X1("sim"), CY("sim")), (1135, CY("sim")), (1135, CY("rpc")), (X0("rpc"), CY("rpc"))]),
    ("5  You give your Nod", "The card shows what it really does. Hold, then fingerprint or face.", ["card", "bio"], None),
    ("6  Your wallet signs", "The phone asks your wallet to sign. Keys never leave it.", ["mwa", "w"],
     [(X1("mwa"), CY("mwa") - 8), (1165, CY("mwa") - 8), (1165, CY("w")), (X0("w"), CY("w"))]),
    ("7  Submit and report", "The signed transaction goes to Solana, and the result returns to the agent.", ["mwa", "rpc", "api", "agent"],
     [(X1("mwa"), CY("mwa") + 10), (1150, CY("mwa") + 10), (1150, CY("rpc") + 14), (X0("rpc"), CY("rpc") + 14)]),
]
RESULT = [(X0("mwa"), CY("mwa") + 14), (672, CY("mwa") + 14), (672, CY("api") + 12), (X1("api"), CY("api") + 12)]
def vert(a, b, dx=60): return [(X0(a) + dx, Bt(a)), (X0(a) + dx, T(b))]
INNER5 = [vert("card", "bio"), vert("bio", "mwa")]
INNER4 = [vert("handler", "decoder"), vert("decoder", "sim")]
INNER3 = [vert("policy", "push", 90)]

def plen(pts): return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
def along(pts, f):
    tot = plen(pts); d = f * tot; acc = 0; out = [pts[0]]
    for i in range(len(pts) - 1):
        seg = math.dist(pts[i], pts[i + 1])
        if acc + seg >= d:
            r = (d - acc) / seg if seg else 0
            out.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r)); return out
        acc += seg; out.append(pts[i + 1])
    return out

def arrow(c, pts, f, col, width=2.5, head=True, dot=False):
    if f <= 0: return
    seg = along(pts, min(1.0, f))
    c.line(seg, col, width)
    if head and f >= 0.999 and len(seg) >= 2:
        (x1, y1), (x2, y2) = seg[-2], seg[-1]
        a = math.atan2(y2 - y1, x2 - x1); s = 9
        c.d.polygon([(x2 * SS, y2 * SS), ((x2 - s * math.cos(a - 0.45)) * SS, (y2 - s * math.sin(a - 0.45)) * SS),
                     ((x2 - s * math.cos(a + 0.45)) * SS, (y2 - s * math.sin(a + 0.45)) * SS)], fill=col)
    if dot and 0 < f < 0.999:
        x, y = seg[-1]; c.circle(x, y, 7, fill=col)

def frame(step, f):
    """step: index being played (or 7 = all done), f: progress inside the step."""
    c = Canvas(W, H)
    c.text(50, 50, "ARCHITECTURE", font("geist-400", 13), MUTED)
    c.text(50, 78, "How one proposal travels from an agent to the chain", font("jakarta-500", 30), TEXT)
    for key, x, y, w, h, title, sub in CONT:
        c.rr(x, y, w, h, 14, fill=CARD, outline=BORDER)
        c.text(x + 20, y + 20, title, font("geist-500", 13), MUTED)
        c.text(x + 20, y + 42, sub, font("jakarta-400", 14), mix(CARD, MUTED, 0.75))
    active = set(STEPS[step][2]) if step < 7 else set()
    done = set()
    for i in range(min(step, 7)): done |= set(STEPS[i][2])
    for key, (cont, x, y, w, name, sub) in M.items():
        on = key in active; was = key in done
        fill = mix(CARD2, ACC, 0.16) if on else CARD2
        c.rr(x, y, w, MH, 10, fill=fill, outline=ACC if on else (mix(BORDER, ACC, 0.45) if was else BORDER), width=2 if on else 1)
        c.text(x + 16, y + 11, name, font("jakarta-500", 17), TEXT)
        c.text(x + 16, y + 36, sub, font("jakarta-400", 13), MUTED if not on else mix(MUTED, TEXT, 0.4))
    dim = mix(BORDER, MUTED, 0.55)
    def path_draw(pts, state, prog=1.0):
        if state == "todo": return
        col = mix(BG, ACC, 0.5) if state == "done" else ACC
        arrow(c, pts, prog if state == "now" else 1.0, col, dot=(state == "now"))
    all_paths = {
        0: [STEPS[0][3]], 1: [STEPS[1][3]], 2: [STEPS[2][3]] + INNER3, 3: [STEPS[3][3]] + INNER4,
        4: INNER5, 5: [STEPS[5][3]], 6: [STEPS[6][3], RESULT],
    }
    for i, paths in all_paths.items():
        state = "done" if i < step else ("now" if i == step else "todo")
        for pi, p in enumerate(paths):
            prog = clamp(f * 1.15) if state == "now" else 1.0
            path_draw(p, state, prog)
    # labels
    # step badges
    for i, st in enumerate(STEPS):
        pass
    # trust notes
    c.text(350, 585, "Never holds a key that can move funds.", font("jakarta-400", 14), mix(BG, MUTED, 0.9))
    c.text(740, 726, "Verifies what it signs. Keys stay in the wallet.", font("jakarta-400", 14), MUTED)
    # caption bar
    c.rr(50, 800, W - 100, 70, 12, fill=CARD, outline=BORDER)
    if step < 7:
        title, cap = STEPS[step][0], STEPS[step][1]
        c.text(78, 835, title, font("geist-500", 17), ACC, anchor="lm")
        c.text(78 + 330, 835, cap, font("jakarta-400", 18), TEXT, anchor="lm")
    else:
        c.text(78, 835, "Done", font("geist-500", 17), OK, anchor="lm")
        c.text(78 + 330, 835, "Nothing moved without your Nod.", font("jakarta-400", 18), TEXT, anchor="lm")
    # progress ticks
    for i in range(7):
        x = W - 120 + i * 0  # placeholder
    for i in range(7):
        cx = W - 90 - (6 - i) * 22
        col = ACC if i == step else (mix(BORDER, ACC, 0.5) if i < step else BORDER)
        c.circle(cx, 835, 6, fill=col)
    return c.out()

def arch_frames():
    fps = 10
    frames = []
    for s in range(7):
        n = int(2.0 * fps)
        for k in range(n):
            frames.append(frame(s, (k + 1) / n))
        for _ in range(int(0.4 * fps)): frames.append(frame(s, 1.0))
    for _ in range(int(2.2 * fps)): frames.append(frame(7, 1.0))
    return frames, fps

# ---------------------------------------------------------------- transparent knot
def knot_mask(size, t=None, T3=3):
    W_ = len(KNOT_ROWS[0]) * 2; H_ = len(KNOT_ROWS) * 4
    cell = size / max(W_, H_); S = T3
    m = Image.new("L", (size * S, size * S), 0); d = ImageDraw.Draw(m)
    for cy, row in enumerate(KNOT_ROWS):
        for cx, ch in enumerate(row):
            bits = ord(ch) - 0x2800
            for dx, dy, bit in BITS:
                if not bits & bit: continue
                x, y = cx * 2 + dx, cy * 4 + dy
                diag = (x / W_ + y / H_) / 2; b = B8[y & 7][x & 7]
                if t is not None:
                    intro = t / 2.0 * 1.35
                    if intro < 2 and intro - diag < b * 0.45: continue
                    if t >= 2.0:
                        phase = ((t - 2.0) % 6.0) / 6.0 * 1.8 - 0.4
                        if phase > -0.3:
                            band = 1 - min(1, abs(diag - phase) / 0.13)
                            if band > 0 and b < band * 0.85: continue
                r = cell * 0.42 * S
                d.ellipse([(x + 0.5) * cell * S - r, (y + 0.5) * cell * S - r, (x + 0.5) * cell * S + r, (y + 0.5) * cell * S + r], fill=255)
    return m.resize((size, size), Image.LANCZOS)

def rgba(mask, color):
    im = Image.new("RGBA", mask.size, color + (0,)); im.putalpha(mask); return im

def save_transparent_gif(masks, color, path, fps):
    pal = [0, 0, 0] + list(color) + [0] * (256 * 3 - 6)
    frames = []
    for m in masks:
        p = Image.new("P", m.size); p.putpalette(pal)
        p.putdata([1 if v >= 128 else 0 for v in m.getdata()])
        frames.append(p)
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=int(1000 / fps), loop=0, transparency=0, disposal=2, optimize=False)

if __name__ == "__main__":
    import sys, os
    what = sys.argv[1:] or ["arch", "knot"]
    if "arch" in what:
        fr, fps = arch_frames()
        save_gif(fr, "nod-architecture", fps)
    if "knot" in what:
        big = knot_mask(1800)
        rgba(big, (153, 172, 255)).save(f"{OUT}/nod-knot-lavender.png")
        rgba(big, (58, 85, 200)).save(f"{OUT}/nod-knot-blue.png")
        rgba(big, (243, 242, 242)).save(f"{OUT}/nod-knot-white.png")
        fps, T = 15, 8.0
        masks = [knot_mask(600, i / fps) for i in range(int(T * fps))]
        save_transparent_gif(masks, (153, 172, 255), f"{OUT}/nod-knot-assemble-transparent.gif", fps)
        print("knot done")
