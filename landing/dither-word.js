// "Nod." in the headline, redrawn as ordered-dither dots. The real text stays in the page (hidden
// once the canvas is ready) so it can be selected and read aloud. At rest the letters are solid;
// on load they assemble through the dither, and a band sweeps through them now and then.
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

  let cols = 0, rows = 0, cell = 0, cover = null, accent = "#99ACFF";
  const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  function build() {
    const cs = getComputedStyle(textEl);
    const rect = textEl.getBoundingClientRect();
    const w = Math.ceil(rect.width), h = Math.ceil(rect.height);
    if (!w || !h) return false;
    accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || accent;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Rasterise the word once, then measure how much of each dot cell it covers.
    const fs = parseFloat(cs.fontSize);
    cell = Math.max(3, fs / 22);
    cols = Math.ceil(w / cell);
    rows = Math.ceil(h / cell);
    const off = document.createElement("canvas");
    off.width = cols * 4; off.height = rows * 4; // 4x4 samples per cell
    const o = off.getContext("2d", { willReadFrequently: true });
    const sx = off.width / (cols * cell), sy = off.height / (rows * cell);
    o.scale(sx, sy);
    o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    o.letterSpacing = cs.letterSpacing;
    o.textBaseline = "alphabetic";
    // Same baseline the DOM uses: the line box centres the font's ascent and descent.
    const m = o.measureText(textEl.textContent);
    const asc = m.fontBoundingBoxAscent ?? fs * 0.8, desc = m.fontBoundingBoxDescent ?? fs * 0.2;
    o.fillStyle = "#fff";
    o.fillText(textEl.textContent, 0, (h - (asc + desc)) / 2 + asc);

    const data = o.getImageData(0, 0, off.width, off.height).data;
    cover = new Float32Array(cols * rows);
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      let sum = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) sum += data[((cy * 4 + j) * off.width + cx * 4 + i) * 4 + 3];
      cover[cy * cols + cx] = sum / (16 * 255);
    }
    host.classList.add("is-ready");
    return true;
  }

  const INTRO = 1800, PERIOD = 9000;
  let start = performance.now();
  let started = false; // headings below the fold assemble when they first scroll into view

  function draw(now) {
    if (!cover) return;
    const t = Math.max(0, now - start);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = accent;
    const intro = reduced ? 2 : t / INTRO * 1.4;
    const phase = reduced ? -1 : ((t - INTRO) % PERIOD) / PERIOD * 1.8 - 0.4;
    const r = cell * 0.46;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      let c = cover[y * cols + x];
      if (c <= 0.02) continue;
      const b = bayer[y & 7][x & 7];
      const diag = x / cols;
      // Letters are solid where they are mostly inked; edges dither.
      c = smooth(0.04, 0.4, c);
      if (intro < 2) c *= smooth(0, 0.5, intro - diag);
      if (phase > -0.3) c *= 1 - Math.max(0, 1 - Math.abs(diag - phase) / 0.22) * 0.9;
      if (c <= b) continue;
      ctx.beginPath();
      ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, r, 0, 6.2832);
      ctx.fill();
    }
  }

  let raf = 0, visible = true;
  const loop = (now) => { draw(now); raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0; };
  const kick = () => { if (!raf && !reduced && cover) raf = requestAnimationFrame(loop); };

  const init = () => {
    if (!build()) return;
    start = performance.now();
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
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (cover) { build(); draw(performance.now()); } });
  }
})();
