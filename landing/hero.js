// The knot, drawn as the same Braille dots the nod-server start-up screen prints, enlarged.
// Every dot is a yes/no decision against an 8x8 Bayer threshold, so all motion is dithering:
// the dots assemble on load, a dither band sweeps across now and then, and the pointer
// punches a dithered hole in the knot.
(() => {
  const canvas = document.getElementById("knot");
  const rows = window.NOD_KNOT;
  if (!canvas || !rows) return;
  const ctx = canvas.getContext("2d");

  // Braille dot bit -> (column, row) inside a 2x4 cell.
  const BITS = [[0, 0, 1], [0, 1, 2], [0, 2, 4], [1, 0, 8], [1, 1, 16], [1, 2, 32], [0, 3, 64], [1, 3, 128]];
  const W = rows[0].length * 2;
  const H = rows.length * 4;
  const on = new Uint8Array(W * H);
  rows.forEach((row, cy) => {
    [...row].forEach((ch, cx) => {
      const m = ch.codePointAt(0) - 0x2800;
      for (const [dx, dy, bit] of BITS) if (m & bit) on[(cy * 4 + dy) * W + cx * 2 + dx] = 1;
    });
  });

  // 8x8 Bayer matrix, normalised to [0, 1).
  const bayer = (() => {
    let m = [[0, 2], [3, 1]];
    for (let n = 2; n < 8; n *= 2) {
      const next = Array.from({ length: n * 2 }, () => new Array(n * 2));
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = m[y][x] * 4;
        next[y][x] = v; next[y][x + n] = v + 2; next[y + n][x] = v + 3; next[y + n][x + n] = v + 1;
      }
      m = next;
    }
    return m.map((r) => r.map((v) => (v + 0.5) / 64));
  })();

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let colors = { accent: "#99ACFF", ghost: "rgba(255,255,255,.09)" };
  const readColors = () => {
    const s = getComputedStyle(document.documentElement);
    colors = { accent: s.getPropertyValue("--accent").trim(), ghost: s.getPropertyValue("--ghost").trim() };
  };
  readColors();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readColors(); draw(performance.now()); });

  let size = { w: 0, h: 0, cell: 0, ox: 0, oy: 0 };
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = Math.min(r.width / W, r.height / H);
    size = { w: r.width, h: r.height, cell, ox: (r.width - cell * W) / 2, oy: (r.height - cell * H) / 2 };
  };

  // Pointer, in dot coordinates, eased so the hole glides instead of jumping.
  const pointer = { x: -999, y: -999, tx: -999, ty: -999, active: false };
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.tx = (e.clientX - r.left - size.ox) / size.cell;
    pointer.ty = (e.clientY - r.top - size.oy) / size.cell;
    if (!pointer.active) { pointer.x = pointer.tx; pointer.y = pointer.ty; pointer.active = true; }
  });
  canvas.addEventListener("pointerleave", () => { pointer.active = false; pointer.tx = pointer.ty = -999; });

  const INTRO = 2400;   // ms for the dots to assemble
  const PERIOD = 9000;  // ms between sweeps
  const start = performance.now();
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  function draw(now) {
    const t = now - start;
    ctx.clearRect(0, 0, size.w, size.h);
    pointer.x += (pointer.tx - pointer.x) * 0.18;
    pointer.y += (pointer.ty - pointer.y) * 0.18;

    const intro = reduced ? 2 : t / INTRO * 1.35;
    const phase = reduced ? -1 : ((t - INTRO) % PERIOD) / PERIOD * 1.8 - 0.4; // band centre along the diagonal
    const r = size.cell * 0.4;
    const holeR = 11;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const b = bayer[y & 7][x & 7];
        const diag = (x / W + y / H) / 2;
        let shown = on[i] === 1;

        if (shown) {
          // Assemble: dots arrive along the diagonal, each at its own dithered moment.
          if (intro < 2 && intro - diag * 1.0 < b * 0.45) shown = false;
          // Sweep: a band of the knot dissolves into the dither pattern, then returns.
          if (shown && phase > -0.3) {
            const band = 1 - Math.min(1, Math.abs(diag - phase) / 0.13);
            if (band > 0 && b < band * 0.85) shown = false;
          }
          // Pointer: a hole whose edge is dithered.
          if (shown && pointer.active) {
            const d = Math.hypot(x - pointer.x, y - pointer.y);
            if (d < holeR && b < 1 - d / holeR) shown = false;
          }
        }

        const px = size.ox + (x + 0.5) * size.cell;
        const py = size.oy + (y + 0.5) * size.cell;
        ctx.fillStyle = shown ? colors.accent : colors.ghost;
        ctx.beginPath();
        ctx.arc(px, py, shown ? r : r * 0.6, 0, 6.2832);
        ctx.fill();
      }
    }
  }

  let raf = 0, visible = true;
  const loop = (now) => { draw(now); raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0; };
  const kick = () => { if (!raf && !reduced) raf = requestAnimationFrame(loop); };

  new ResizeObserver(() => { resize(); draw(performance.now()); }).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(canvas);
  document.addEventListener("visibilitychange", kick);
  resize();
  if (reduced) draw(performance.now()); else kick();
})();
