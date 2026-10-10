import sys, os
import numpy as np
from PIL import Image
import gifs, arch_gif

OUT = gifs.OUT
JOBS = {
    "nod-dither-word": gifs.word_frames,
    "nod-terminal-propose": gifs.terminal_frames,
    "nod-claim-vs-reality": gifs.compare_frames,
    "nod-limits-slider": gifs.limits_frames,
    "nod-approve-flow": gifs.phone_frames,
    "nod-fingerprint": gifs.fingerprint_frames,
    "nod-architecture": arch_gif.arch_frames,
}

def render(builder, bg):
    gifs.BG_OVERRIDE = bg
    try:
        return builder()
    finally:
        gifs.BG_OVERRIDE = None

def matte(black, white):
    """Recover colour and alpha of a frame from renders on black and on white."""
    b = np.asarray(black, dtype=np.float32); w = np.asarray(white, dtype=np.float32)
    alpha = np.clip(1.0 - (w - b).mean(axis=2) / 255.0, 0.0, 1.0)
    with np.errstate(divide="ignore", invalid="ignore"):
        rgb = np.where(alpha[..., None] > 0.01, b / np.maximum(alpha[..., None], 1e-3), 0)
    return np.clip(rgb, 0, 255).astype(np.uint8), alpha

def save_transparent(frames_bw, name, fps, disposal=1):
    rgbs, masks = [], []
    for black, white in frames_bw:
        rgb, a = matte(black, white)
        rgbs.append(Image.fromarray(rgb)); masks.append(a < 0.5)
    sample = rgbs[:: max(1, len(rgbs) // 10)]
    strip = Image.new("RGB", (rgbs[0].width, rgbs[0].height * len(sample)))
    for i, f in enumerate(sample): strip.paste(f, (0, i * f.height))
    pal = strip.quantize(colors=255, method=Image.MEDIANCUT)
    out = []
    for im, m in zip(rgbs, masks):
        q = im.quantize(palette=pal, dither=Image.Dither.NONE)
        q.paste(255, mask=Image.fromarray((m * 255).astype(np.uint8)))
        out.append(q)
    path = f"{OUT}/{name}-transparent.gif"
    out[0].save(path, save_all=True, append_images=out[1:], duration=int(1000 / fps), loop=0, transparency=255, disposal=disposal, optimize=False)
    print(name, len(out), "frames", round(os.path.getsize(path) / 1e6, 2), "MB")

if __name__ == "__main__":
    only = sys.argv[1:] or list(JOBS)
    for name in only:
        builder = JOBS[name]
        arch_gif.SHOW_DOT = name != 'nod-architecture'
        arch_gif.SHOW_TITLE = name != 'nod-architecture'
        fb, fps = render(builder, (0, 0, 0))
        fw, _ = render(builder, (255, 255, 255))
        # dots that vanish need the previous frame cleared; the card-based ones keep a fixed outline
        save_transparent(list(zip(fb, fw)), name, fps, disposal=2 if name == 'nod-dither-word' else 1)
