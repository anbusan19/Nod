// A word redrawn as a grid of dots. The real text stays in the page (transparent once the canvas is
// ready) so it can be selected and read aloud. At rest the dots form a clean dot-matrix word; on
// first view they assemble through an ordered dither, and a band sweeps through now and then.
// Add data-static to a word to skip all motion.
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  document.querySelectorAll(".dither-word").forEach(setup);

  function setup(host) {
  const textEl = host.querySelector(".dither-text");
  if (!textEl) return;
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let cols = 0, rows = 0, cell = 0, cover = null, on = null, accent = "#99ACFF";
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  function build() {
    const cs = getComputedStyle(textEl);
    const hostRect = host.getBoundingClientRect();
    const rect = textEl.getBoundingClientRect(); // the text's own box (font ascent to descent)
    const w = Math.ceil(rect.width), h = Math.ceil(rect.height);
    if (!w || !h) return false;
    accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || accent;

    // The canvas must sit exactly on the text box, which is not the same as the host's line box.
    canvas.style.left = `${rect.left - hostRect.left}px`;
    canvas.style.top = `${rect.top - hostRect.top}px`;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Rasterise the word at 6x6 samples per dot cell and keep how much of each cell is inked.
    const fs = parseFloat(cs.fontSize);
    cell = parseFloat(host.dataset.cell) || Math.max(2, fs / 20);
    cols = Math.ceil(w / cell);
    rows = Math.ceil(h / cell);
    const S = 6;
    const off = document.createElement("canvas");
    off.width = cols * S; off.height = rows * S;
    const o = off.getContext("2d", { willReadFrequently: true });
    const k = S / cell;
    o.scale(k, k);
    o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    o.letterSpacing = cs.letterSpacing;
    o.textBaseline = "alphabetic";
    const m = o.measureText(textEl.textContent);
    const asc = m.fontBoundingBoxAscent ?? fs * 0.8, desc = m.fontBoundingBoxDescent ?? fs * 0.2;
    o.fillStyle = "#fff";
    o.fillText(textEl.textContent, 0, (h - (asc + desc)) / 2 + asc);

    const data = o.getImageData(0, 0, off.width, off.height).data;
    cover = new Float32Array(cols * rows);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      let sum = 0;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) sum += data[((cy * S + j) * off.width + cx * S + i) * 4 + 3];
      cover[cy * cols + cx] = sum / (S * S * 255);
    }
    // Which cells are dots. A cell is a dot when the letter covers most of it; then any stroke that
    // is only one dot thick (the stem of an i or l, its tittle, a full stop) is widened to two.
    on = new Uint8Array(cols * rows);
    for (let n = 0; n < on.length; n++) on[n] = cover[n] >= 0.42 ? 1 : 0;
    const base = on.slice();
    const at = (x, y) => (x >= 0 && y >= 0 && x < cols && y < rows ? base[y * cols + x] : 0);
    const cv = (x, y) => (x >= 0 && y >= 0 && x < cols && y < rows ? cover[y * cols + x] : -1);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!at(x, y)) continue;
      if (!at(x - 1, y) && !at(x + 1, y)) {
        if (cv(x + 1, y) >= cv(x - 1, y) && cv(x + 1, y) >= 0) on[y * cols + x + 1] = 1; else if (cv(x - 1, y) >= 0) on[y * cols + x - 1] = 1;
      }
      if (!at(x, y - 1) && !at(x, y + 1)) {
        if (cv(x, y + 1) >= cv(x, y - 1) && cv(x, y + 1) >= 0) on[(y + 1) * cols + x] = 1; else if (cv(x, y - 1) >= 0) on[(y - 1) * cols + x] = 1;
      }
    }
    host.classList.add("is-ready");
    return true;
  }

  const INTRO = 1800, PERIOD = 9000, SWEEP = 2400;
  const still = host.hasAttribute("data-static");
  let start = performance.now();
  let started = false; // headings below the fold assemble when they first scroll into view

  // The word is always dots. At rest a cell is a dot when the letter covers most of it, which keeps
  // the letterforms crisp. While moving, the same dots drop out and return through a Bayer matrix.
  function draw(now) {
    if (!cover) return;
    const t = Math.max(0, now - start);
    const local = (t - INTRO) % PERIOD;
    const intro = reduced || still ? 2 : t / INTRO * 1.4;
    const sweeping = !reduced && !still && t > INTRO && local < SWEEP;
    const phase = sweeping ? -0.25 + 1.5 * (local / SWEEP) : -1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = accent;
    const r = cell * 0.5;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!on[y * cols + x]) continue;
      const b = bayer[y & 7][x & 7];
      const diag = x / cols;
      let f = 1;
      if (intro < 2) f *= smooth(0, 0.5, intro - diag);
      if (sweeping) f *= 1 - Math.max(0, 1 - Math.abs(diag - phase) / 0.22) * 0.9;
      if (f <= b && f < 1) continue;
      ctx.beginPath();
      ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, r, 0, 6.2832);
      ctx.fill();
    }
  }

  let raf = 0, visible = true;
  const loop = (now) => { draw(now); raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0; };
  const kick = () => { if (!raf && !reduced && !still && cover) raf = requestAnimationFrame(loop); };

  const init = () => {
    if (!build()) return;
    start = performance.now();
    if (still) { draw(start); return; }
    started = host.getBoundingClientRect().top < innerHeight;
    if (!started && !reduced) start = Infinity; // draw nothing until it is seen
    draw(performance.now());
    kick();
  };
  // Wait for the web font, or the word would be measured and drawn in the fallback face.
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(init);
  let lastW = 0;
  new ResizeObserver(() => {
    const w = Math.round(textEl.getBoundingClientRect().width);
    if (w && w !== lastW) { lastW = w; if (cover) { build(); draw(performance.now()); } }
  }).observe(textEl);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !started && cover) { started = true; start = performance.now(); }
    kick();
  }).observe(host);
  document.addEventListener("visibilitychange", kick);
  const rebuild = () => { if (cover) { build(); draw(performance.now()); } };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rebuild);
  window.addEventListener("nod-theme", rebuild);
  }
})();
