import json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from svgpathtools import parse_path

SS = 2
BG = (7, 6, 6); CARD = (19, 18, 18); CARD2 = (27, 26, 26); BORDER = (41, 39, 39)
TEXT = (243, 242, 242); MUTED = (156, 154, 154)
ACC = (153, 172, 255); OK = (76, 215, 160); WARN = (245, 178, 91); BAD = (255, 122, 122); ONPRIM = (7, 6, 6)
OUT = "/Users/alphataco/Desktop/Nod/docs/pitch/gifs"
os.makedirs(OUT, exist_ok=True)

def mix(a, b, t):
    t = max(0.0, min(1.0, t)); return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
def clamp(v, a=0.0, b=1.0): return max(a, min(b, v))
def smooth(a, b, v):
    t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t)
def ease(t): t = clamp(t); return 1 - (1 - t) ** 3

_fc = {}
def font(name, size):
    k = (name, size)
    if k not in _fc: _fc[k] = ImageFont.truetype(f"fonts/{name}.ttf", int(round(size * SS)))
    return _fc[k]

BG_OVERRIDE = None  # set by the transparent exporter to render the page background in a chosen colour
class Canvas:
    def __init__(s, w, h, bg=None):
        s.w, s.h = w, h
        if bg is None: bg = BG_OVERRIDE if BG_OVERRIDE is not None else BG
        s.im = Image.new("RGB", (w * SS, h * SS), bg); s.d = ImageDraw.Draw(s.im)
    def rr(s, x, y, w, h, r=8, fill=None, outline=None, width=1):
        s.d.rounded_rectangle([x * SS, y * SS, (x + w) * SS - 1, (y + h) * SS - 1], radius=r * SS, fill=fill, outline=outline, width=max(1, int(width * SS)))
    def rect(s, x, y, w, h, fill):
        s.d.rectangle([x * SS, y * SS, (x + w) * SS - 1, (y + h) * SS - 1], fill=fill)
    def text(s, x, y, t, f, fill, anchor="la"):
        s.d.text((x * SS, y * SS), t, font=f, fill=fill, anchor=anchor)
    def tw(s, t, f): return s.d.textlength(t, font=f) / SS
    def line(s, pts, fill, width):
        if len(pts) > 1: s.d.line([(x * SS, y * SS) for x, y in pts], fill=fill, width=max(1, int(width * SS)), joint="curve")
    def circle(s, x, y, r, fill=None, outline=None, width=1):
        s.d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=fill, outline=outline, width=max(1, int(width * SS)))
    def out(s): return s.im.resize((s.w, s.h), Image.LANCZOS)

def save_gif(frames, name, fps):
    sample = frames[:: max(1, len(frames) // 10)]
    strip = Image.new("RGB", (frames[0].width, frames[0].height * len(sample)))
    for i, f in enumerate(sample): strip.paste(f, (0, i * f.height))
    pal = strip.quantize(colors=128, method=Image.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    path = f"{OUT}/{name}.gif"
    q[0].save(path, save_all=True, append_images=q[1:], duration=int(1000 / fps), loop=0, optimize=False, disposal=1)
    print(name, len(frames), "frames", round(os.path.getsize(path) / 1e6, 2), "MB")

# Bayer 8x8
def bayer8():
    m = [[0, 2], [3, 1]]
    n = 2
    while n < 8:
        nx = [[0] * (n * 2) for _ in range(n * 2)]
        for y in range(n):
            for x in range(n):
                v = m[y][x] * 4
                nx[y][x] = v; nx[y][x + n] = v + 2; nx[y + n][x] = v + 3; nx[y + n][x + n] = v + 1
        m = nx; n *= 2
    return [[(v + 0.5) / 64 for v in r] for r in m]
B8 = bayer8()

# ---------------------------------------------------------------- knot
src = open("/Users/alphataco/Desktop/Nod/landing/knot.js").read()
KNOT_ROWS = json.loads(src[src.index("["): src.rindex("]") + 1])
BITS = [(0, 0, 1), (0, 1, 2), (0, 2, 4), (1, 0, 8), (1, 1, 16), (1, 2, 32), (0, 3, 64), (1, 3, 128)]


# Seamless loop for the knot: assemble from the top-left, hold with one dither sweep, then
# dissolve in the same direction, ending on empty, which is where it starts.
KNOT_LOOP_T = 8.6
def knot_visible(diag, b, t):
    A = lambda s: s / 2.0 * 1.35          # 0 -> 1.45 over 2.15 s
    if t < 2.15:
        if A(t) - diag < b * 0.45: return False
    elif t >= 6.0:
        if A(t - 6.0) - diag >= b * 0.45: return False
    if 2.6 <= t < 5.0:
        phase = -0.3 + 1.7 * ((t - 2.6) / 2.4)
        band = 1 - min(1, abs(diag - phase) / 0.13)
        if band > 0 and b < band * 0.85: return False
    return True

def knot_frames():
    W = len(KNOT_ROWS[0]) * 2; H = len(KNOT_ROWS) * 4
    dots = []
    for cy, row in enumerate(KNOT_ROWS):
        for cx, ch in enumerate(row):
            m = ord(ch) - 0x2800
            for dx, dy, bit in BITS:
                if m & bit:
                    x, y = cx * 2 + dx, cy * 4 + dy
                    dots.append((x, y, (x / W + y / H) / 2, B8[y & 7][x & 7]))
    size = 600; cell = size / max(W, H); r = cell * 0.42
    fps, T = 15, KNOT_LOOP_T
    frames = []
    for i in range(int(round(T * fps))):
        t = i / fps
        c = Canvas(size, size)
        for x, y, diag, b in dots:
            if not knot_visible(diag, b, t): continue
            c.circle((x + 0.5) * cell, (y + 0.5) * cell, r, fill=ACC)
        frames.append(c.out())
    return frames, fps

# ---------------------------------------------------------------- dither word
def word_grid(text, fname, fs, cell):
    S = 6
    k = S / cell
    f = ImageFont.truetype(f"fonts/{fname}.ttf", int(round(fs * k)))
    asc, desc = f.getmetrics()
    w = f.getlength(text); h = asc + desc
    cols, rows = math.ceil(w / S), math.ceil(h / S)
    im = Image.new("L", (cols * S, rows * S), 0)
    ImageDraw.Draw(im).text((0, 0), text, font=f, fill=255, anchor="la")
    a = np.asarray(im, dtype=np.float32) / 255.0
    cover = a.reshape(rows, S, cols, S).mean(axis=(1, 3))
    on = cover >= 0.42
    base = on.copy()
    def at(x, y): return bool(base[y, x]) if 0 <= x < cols and 0 <= y < rows else False
    def cv(x, y): return cover[y, x] if 0 <= x < cols and 0 <= y < rows else -1
    for y in range(rows):
        for x in range(cols):
            if not at(x, y): continue
            if not at(x - 1, y) and not at(x + 1, y):
                if cv(x + 1, y) >= cv(x - 1, y) and cv(x + 1, y) >= 0: on[y, x + 1] = True
                elif cv(x - 1, y) >= 0: on[y, x - 1] = True
            if not at(x, y - 1) and not at(x, y + 1):
                if cv(x, y + 1) >= cv(x, y - 1) and cv(x, y + 1) >= 0: on[y + 1, x] = True
                elif cv(x, y - 1) >= 0: on[y - 1, x] = True
    return on, cols, rows

def word_frames(text="Nod.", fname="jakarta-600", fs=170, color=ACC):
    cell = fs / 30
    on, cols, rows = word_grid(text, fname, fs, cell)
    cw, ch = int(cols * cell) + 80, int(rows * cell) + 60
    ox, oy = (cw - cols * cell) / 2, (ch - rows * cell) / 2
    fps, T = 15, 6.4
    frames = []
    for i in range(int(T * fps)):
        t = i / fps
        intro = t / 1.8 * 1.4
        sweeping = 2.6 <= t < 5.0
        phase = -0.25 + 1.5 * ((t - 2.6) / 2.4) if sweeping else -1
        c = Canvas(cw, ch)
        for y in range(rows):
            for x in range(cols):
                if not on[y, x]: continue
                b = B8[y & 7][x & 7]; diag = x / cols; f = 1.0
                if intro < 2: f *= smooth(0, 0.5, intro - diag)
                if sweeping: f *= 1 - max(0, 1 - abs(diag - phase) / 0.22) * 0.9
                if f <= b and f < 1: continue
                c.circle(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell, cell * 0.5, fill=color)
        frames.append(c.out())
    return frames, fps

# ---------------------------------------------------------------- shared widgets
LUCIDE = ["M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4", "M14 13.12c0 2.38 0 6.38-1 8.88", "M17.29 21.02c.12-.6.43-2.3.5-3.02",
          "M2 12a10 10 0 0 1 18-6", "M2 16h.01", "M21.8 16c.2-2 .131-5.354 0-6", "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2",
          "M8.65 22c.21-.66.45-1.32.57-2", "M9 6.8a6 6 0 0 1 9 5.2v2"]
FP = []
for d in LUCIDE:
    p = parse_path(d)
    FP.append([(p.point(k / 48).real, p.point(k / 48).imag) for k in range(49)])

def draw_fingerprint(c, cx, cy, size, t, bg, glow=0.0):
    s = size / 24.0; ox, oy = cx - size / 2, cy - size / 2
    w = 1.5 * s
    for i, pts in enumerate(FP):
        P = [(ox + x * s, oy + y * s) for x, y in pts]
        c.line(P, mix(ACC, bg, 0.78), w)
        for q in (P[0], P[-1]): c.circle(q[0], q[1], w / 2, fill=mix(ACC, bg, 0.78))
        frac = clamp((t - (i * 0.17 + 0.05)) / 0.7)
        if frac <= 0: continue
        n = max(2, int(frac * (len(P) - 1)) + 1)
        col = mix(ACC, (255, 255, 255), glow * 0.35)
        c.line(P[:n], col, w)
        c.circle(P[0][0], P[0][1], w / 2, fill=col); c.circle(P[n - 1][0], P[n - 1][1], w / 2, fill=col)

def pill_button(c, x, y, w, h, label, fill, fg, outline=None):
    c.rr(x, y, w, h, 10, fill=fill, outline=outline)
    c.text(x + w / 2, y + h / 2, label, font("geist-500", 13), fg, anchor="mm")

# ---------------------------------------------------------------- terminal
def terminal_frames():
    W, H = 760, 380
    fps, T = 15, 5.6
    runs = [
        [("$ ", ACC), ("nod.propose({", TEXT)],
        [("  agent:  ", TEXT), ('"demo-agent"', OK), (",", TEXT)],
        [("  reason: ", TEXT), ('"Weather API credits"', OK), (",", TEXT)],
        [("  tx:     ", TEXT), ('"AQAAAAAA…"', OK), ("  // 0.05 SOL", MUTED)],
        [("})", TEXT)],
    ]
    fm = font("geist-400", 19)
    frames = []
    for i in range(int(T * fps)):
        t = i / fps
        c = Canvas(W, H)
        c.rr(40, 40, W - 80, H - 80, 14, fill=CARD, outline=BORDER)
        c.rr(64, 64, W - 128, 190, 10, fill=CARD2, outline=BORDER)
        for li, line in enumerate(runs):
            total = sum(len(s) for s, _ in line)
            n = int(clamp((t - (0.2 + 0.5 * li)) / 0.7) * total)
            x = 88; y = 84 + li * 33; used = 0
            for s, col in line:
                take = max(0, min(len(s), n - used)); used += len(s)
                if take <= 0: continue
                seg = s[:take]
                c.text(x, y, seg, fm, col)
                x += c.tw(s[:take], fm) if take == len(s) else c.tw(seg, fm)
        a = smooth(2.6, 3.1, t)
        if a > 0:
            c.circle(88 + 5, 290 + 11, 5, fill=mix(CARD, OK, a))
            c.text(110, 290, "Sent. Waiting for the owner's Nod.", font("jakarta-400", 18), mix(CARD, MUTED, a))
        frames.append(c.out())
    return frames, fps

# ---------------------------------------------------------------- claim vs reality
def compare_state(mode):
    W, H = 760, 470
    c = Canvas(W, H)
    c.rr(40, 30, W - 80, H - 60, 14, fill=CARD, outline=BORDER)
    x0, y0 = 66, 56
    # segmented control
    c.rr(x0, y0, 330, 46, 10, fill=BG, outline=BORDER)
    for j, (lab, m) in enumerate((("Honest agent", "honest"), ("Misleading agent", "liar"))):
        bx = x0 + 5 + j * 150
        if m == mode: c.rr(bx, y0 + 5, 138 + (22 if j else 0), 36, 8, fill=CARD2)
        c.text(bx + (79 if j == 0 else 91), y0 + 23, lab, font("jakarta-500", 15), TEXT if m == mode else MUTED, anchor="mm")
    cw = (W - 80 - 52 - 14) / 2
    cy = y0 + 70
    c.rr(x0, cy, cw, 150, 10, fill=BG, outline=BORDER)
    c.text(x0 + 18, cy + 18, "THE AGENT SAYS", font("geist-400", 12), MUTED)
    c.text(x0 + 18, cy + 52, "“Weather API credits”", font("jakarta-500", 20), TEXT)
    c.text(x0 + 18, cy + 92, "Pay 0.05 SOL", font("jakarta-400", 16), MUTED)
    rx = x0 + cw + 14
    edge = mix(BORDER, OK, 0.55) if mode == "honest" else mix(BORDER, BAD, 0.7)
    c.rr(rx, cy, cw, 150, 10, fill=BG, outline=edge, width=1.5)
    c.text(rx + 18, cy + 18, "THE TRANSACTION DOES", font("geist-400", 12), MUTED)
    amt = "Sends 0.05 SOL" if mode == "honest" else "Sends 4.80 SOL"
    sub = "To 7xKX…9fQ2, allowed" if mode == "honest" else "To 9bQr…T3mA, never allowed"
    c.text(rx + 18, cy + 52, amt, font("jakarta-500", 20), TEXT)
    c.text(rx + 18, cy + 92, sub, font("jakarta-400", 16), MUTED)
    col = OK if mode == "honest" else BAD
    vy = cy + 182
    c.circle(x0 + 6, vy + 12, 5, fill=col)
    msg = "Matches. Waiting for your Nod." if mode == "honest" else "Does not match. Over the hard cap: blocked."
    c.text(x0 + 24, vy, msg, font("jakarta-400", 18), TEXT)
    c.text(x0, vy + 52, "Illustrative example.", font("geist-400", 12), MUTED)
    return c.im.resize((W, H), Image.LANCZOS)

def compare_frames():
    A, B = compare_state("honest"), compare_state("liar")
    fps = 15
    seq = [(A, 2.5), ("A2B", 0.2), (B, 2.7), ("B2A", 0.2)]
    frames = []
    for item, dur in seq:
        n = int(dur * fps)
        for k in range(n):
            if item == "A2B": frames.append(Image.blend(A, B, smooth(0, 1, (k + 1) / n)))
            elif item == "B2A": frames.append(Image.blend(B, A, smooth(0, 1, (k + 1) / n)))
            else: frames.append(item.copy())
    return frames, fps

# ---------------------------------------------------------------- limits slider
def limits_frames():
    W, H = 760, 440
    fps, T = 15, 7.6
    path = [(0, 5), (0.28, 5), (0.5, 150), (0.75, 420), (1, 5)]
    frames = []
    for i in range(int(T * fps)):
        t = i / fps
        k = clamp(t / 6.8)
        j = 0
        while j < len(path) - 2 and k > path[j + 1][0]: j += 1
        (k0, v0), (k1, v1) = path[j], path[j + 1]
        u = clamp((k - k0) / (k1 - k0 or 1)); v = v0 + (v1 - v0) * (u * u * (3 - 2 * u))
        amount = round(v) / 100
        tier = "auto" if amount <= 0.1 else "nod" if amount <= 3 else "block"
        c = Canvas(W, H)
        c.rr(40, 30, W - 80, H - 60, 14, fill=CARD, outline=BORDER)
        x0, tw = 70, W - 140
        c.text(x0, 58, f"{amount:.2f}", font("geist-400", 44), TEXT)
        c.text(x0 + c.tw(f"{amount:.2f}", font("geist-400", 44)) + 12, 78, "SOL", font("jakarta-400", 18), MUTED)
        ty = 140
        c.rr(x0, ty, tw * 0.02, 6, 3, fill=OK)
        c.rect(x0 + tw * 0.02, ty, tw * 0.58, 6, ACC)
        c.rr(x0 + tw * 0.6, ty, tw * 0.4, 6, 3, fill=BAD)
        tx = x0 + tw * (v / 500)
        c.circle(tx, ty + 3, 12, fill=BG); c.circle(tx, ty + 3, 9, fill=TEXT)
        c.text(x0, ty + 24, "auto up to 0.1", font("geist-400", 12), MUTED)
        c.text(x0 + tw * 0.6, ty + 24, "hard cap 3", font("geist-400", 12), MUTED, anchor="ma")
        c.text(x0 + tw, ty + 24, "5 SOL", font("geist-400", 12), MUTED, anchor="ra")
        cw = (tw - 24) / 3
        for n, (key, lab, head, colr) in enumerate((("auto", "AUTO", "No prompt", OK), ("nod", "NOD", "Needs you", ACC), ("block", "BLOCK", "Refused", BAD))):
            x = x0 + n * (cw + 12); y = 210; act = key == tier
            fade = 1.0 if act else 0.4
            c.rr(x, y, cw, 84, 10, fill=BG, outline=mix(BORDER, colr, 0.9) if act else BORDER, width=1.5 if act else 1)
            c.text(x + 16, y + 16, lab, font("geist-400", 12), mix(BG, colr if key != "nod" else ACC, fade))
            c.text(x + 16, y + 44, head, font("jakarta-500", 18), mix(BG, TEXT, fade))
        msg = {"auto": "is under the auto limit: it goes through without a prompt.",
               "nod": "needs you: your phone buzzes and waits for your Nod.",
               "block": "is over the hard cap: refused automatically."}[tier]
        c.text(x0, 320, f"{amount:.2f} SOL {msg}", font("jakarta-400", 17), TEXT)
        c.text(x0, 356, "Example limits. Yours are set per agent.", font("geist-400", 12), MUTED)
        frames.append(c.out())
    return frames, fps

# ---------------------------------------------------------------- phone: decode -> hold -> fingerprint -> signed
def phone_frame(t):
    W, H = 520, 640
    c = Canvas(W, H)
    x0, y0, cw, ch = 40, 30, 440, 580
    c.rr(x0, y0, cw, ch, 22, fill=CARD, outline=BORDER)
    px = x0 + 26
    c.text(px, y0 + 26, "demo-agent", font("jakarta-500", 18), TEXT)
    c.rr(x0 + cw - 150, y0 + 22, 124, 30, 15, outline=BORDER)
    c.text(x0 + cw - 88, y0 + 37, "EXPIRES IN 0:42", font("geist-400", 11), WARN, anchor="mm")
    c.text(px, y0 + 82, "wants to send", font("jakarta-400", 15), MUTED)
    c.text(px, y0 + 106, "0.05", font("geist-400", 46), TEXT)
    c.text(px + c.tw("0.05", font("geist-400", 46)) + 12, y0 + 128, "SOL", font("jakarta-400", 18), MUTED)
    rows = [("To", "7xKX…9fQ2"), ("Program", "System Program"), ("Your balance", None)]
    for i, (lab, val) in enumerate(rows):
        a = ease((t - (0.2 + 0.25 * i)) / 0.5) if t < 2.6 else 1.0
        y = y0 + 190 + i * 50
        c.rect(px, y, cw - 52, 1, mix(CARD, BORDER, a))
        c.text(px, y + 14, lab, font("jakarta-400", 15), mix(CARD, MUTED, a))
        right = x0 + cw - 26
        if val:
            c.text(right, y + 14, val, font("geist-400", 14), mix(CARD, TEXT, a), anchor="ra")
        else:
            f14 = font("geist-400", 14)
            c.text(right, y + 14, "1.1900 SOL", f14, mix(CARD, TEXT, a), anchor="ra")
            ax = right - c.tw("1.1900 SOL", f14) - 14
            col = mix(CARD, MUTED, a)
            c.line([(ax - 12, y + 22), (ax, y + 22)], col, 1.5); c.line([(ax - 5, y + 17), (ax, y + 22), (ax - 5, y + 27)], col, 1.5)
            c.text(ax - 18, y + 14, "1.2400", f14, mix(CARD, TEXT, a), anchor="ra")
    ca = ease((t - 1.0) / 0.5) if t < 2.6 else 1.0
    c.rect(px, y0 + 340, cw - 52, 1, mix(CARD, BORDER, ca))
    c.circle(px + 5, y0 + 366, 5, fill=mix(CARD, OK, ca))
    c.text(px + 22, y0 + 355, "Matches what the agent said.", font("jakarta-400", 15), mix(CARD, MUTED, ca))
    # buttons
    by = y0 + 470
    c.rr(px, by, 124, 54, 12, fill=BG, outline=BORDER)
    c.text(px + 62, by + 27, "REJECT", font("geist-500", 13), TEXT, anchor="mm")
    bx, bw = px + 138, cw - 52 - 138
    c.rr(bx, by, bw, 54, 12, fill=ACC)
    fill = 1.0 if t >= 4.1 else clamp((t - 2.6) / 1.4)
    fill = ease(fill) if t < 4.1 else 1.0
    if fill > 0:
        c.rr(bx, by, max(20, bw * fill), 54, 12, fill=mix(ACC, BG, 0.22))
        if fill < 1: c.rect(bx + max(20, bw * fill) - 12, by, 12, 54, ACC) if False else None
    label = "HOLD TO APPROVE" if t < 4.2 else "VERIFYING…" if t < 7.0 else "APPROVED"
    c.text(bx + bw / 2, by + 27, label, font("geist-500", 13), ONPRIM, anchor="mm")
    base = c.im
    # fingerprint overlay (solid) 4.2 -> 7.0
    if 4.2 <= t < 7.4:
        ov = base.copy(); oc = Canvas(W, H); oc.im = ov; oc.d = ImageDraw.Draw(ov)
        oc.rr(x0, y0, cw, ch, 22, fill=CARD, outline=BORDER)
        ft = t - 4.45
        glow = math.sin(clamp((t - 5.9) / 0.9) * math.pi) if t > 5.9 else 0
        draw_fingerprint(oc, x0 + cw / 2, y0 + ch / 2 - 14, 120, ft, CARD, glow)
        oc.text(x0 + cw / 2, y0 + ch / 2 + 74, "Verifying fingerprint", font("geist-400", 13), MUTED, anchor="mm")
        a = smooth(4.2, 4.45, t) * (1 - smooth(7.0, 7.4, t))
        base = Image.blend(base, ov, a)
    if t >= 7.0:
        prev = c.im.copy() if t >= 7.4 else phone_frame(6.99).resize((W * SS, H * SS), Image.LANCZOS)
        ov = prev.copy()
        oc = Canvas(W, H); oc.im = ov; oc.d = ImageDraw.Draw(ov)
        oc.rr(x0, y0, cw, ch, 22, fill=CARD, outline=BORDER)
        cx, cy = x0 + cw / 2, y0 + ch / 2 - 40
        oc.circle(cx, cy, 34, outline=OK, width=2.5)
        tp = clamp((t - 7.5) / 0.45)
        pts = [(cx - 11, cy + 1), (cx - 3, cy + 10), (cx + 13, cy - 9)]
        if tp > 0:
            seg = [pts[0]]
            L1 = math.dist(pts[0], pts[1]); L2 = math.dist(pts[1], pts[2]); tot = L1 + L2; d = tp * tot
            if d <= L1: seg.append((pts[0][0] + (pts[1][0] - pts[0][0]) * d / L1, pts[0][1] + (pts[1][1] - pts[0][1]) * d / L1))
            else:
                seg.append(pts[1]); r = (d - L1) / L2
                seg.append((pts[1][0] + (pts[2][0] - pts[1][0]) * r, pts[1][1] + (pts[2][1] - pts[1][1]) * r))
            oc.line(seg, OK, 3.5)
        oc.text(cx, cy + 66, "Signed in your wallet", font("jakarta-400", 21), TEXT, anchor="mm")
        oc.text(cx, cy + 98, "5Kd9…vR2q", font("geist-400", 16), ACC, anchor="mm")
        oc.text(cx, cy + 126, "Illustrative", font("geist-400", 12), MUTED, anchor="mm")
        base = Image.blend(prev, ov, smooth(7.0, 7.3, t))
    return base.resize((W, H), Image.LANCZOS)

def phone_frames():
    fps, T = 12, 10.4
    return [phone_frame(i / fps) for i in range(int(T * fps))], fps

# ---------------------------------------------------------------- fingerprint alone
def fingerprint_frames():
    W = H = 360
    fps, T = 15, 3.6
    frames = []
    for i in range(int(T * fps)):
        t = i / fps
        c = Canvas(W, H)
        c.rr(30, 30, W - 60, H - 60, 20, fill=CARD, outline=BORDER)
        glow = math.sin(clamp((t - 1.7) / 0.9) * math.pi) if t > 1.7 else 0
        draw_fingerprint(c, W / 2, H / 2 - 14, 130, t, CARD, glow)
        c.text(W / 2, H / 2 + 86, "Verifying fingerprint", font("geist-400", 13), MUTED, anchor="mm")
        frames.append(c.out())
    return frames, fps

if __name__ == "__main__":
    import sys
    jobs = {
        "nod-knot-assemble": knot_frames, "nod-dither-word": word_frames, "nod-terminal-propose": terminal_frames,
        "nod-claim-vs-reality": compare_frames, "nod-limits-slider": limits_frames,
        "nod-approve-flow": phone_frames, "nod-fingerprint": fingerprint_frames,
    }
    only = sys.argv[1:] or list(jobs)
    for name in only:
        fr, fps = jobs[name]()
        save_gif(fr, name, fps)
