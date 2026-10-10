// Theme control (system, light, dark) and the docs table-of-contents highlight.
(() => {
  const KEY = "nod-theme";
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll("[data-theme-set]")];

  const current = () => {
    try { const t = localStorage.getItem(KEY); return t === "light" || t === "dark" ? t : "system"; } catch { return "system"; }
  };
  const mark = () => {
    const c = current();
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === c)));
  };
  const apply = (value) => {
    if (value === "system") { delete root.dataset.theme; } else { root.dataset.theme = value; }
    try { value === "system" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, value); } catch {}
    mark();
    // canvases read the accent colour once; tell them to redraw
    window.dispatchEvent(new Event("nod-theme"));
  };
  buttons.forEach((b) => b.addEventListener("click", () => apply(b.dataset.themeSet)));
  mark();

  // header mark: the same Braille dots as the hero knot, on a tiny canvas
  const drawMark = () => {
    const rows = window.NOD_KNOT;
    const accent = getComputedStyle(root).getPropertyValue("--accent").trim() || "#99ACFF";
    const BITS = [[0, 0, 1], [0, 1, 2], [0, 2, 4], [1, 0, 8], [1, 1, 16], [1, 2, 32], [0, 3, 64], [1, 3, 128]];
    document.querySelectorAll(".mark-knot").forEach((cv) => {
      if (!rows) return;
      const size = 34, dpr = Math.min(window.devicePixelRatio || 1, 3);
      cv.width = size * dpr; cv.height = size * dpr;
      const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = rows[0].length * 2, H = rows.length * 4, cell = size / Math.max(W, H);
      ctx.fillStyle = accent;
      rows.forEach((row, cy) => [...row].forEach((ch, cx) => {
        const m = ch.codePointAt(0) - 0x2800;
        for (const [dx, dy, bit] of BITS) if (m & bit) {
          ctx.beginPath();
          ctx.arc((cx * 2 + dx + 0.5) * cell, (cy * 4 + dy + 0.5) * cell, cell * 0.62, 0, 6.2832);
          ctx.fill();
        }
      }));
    });
  };
  drawMark();
  window.addEventListener("nod-theme", drawMark);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawMark);

  // docs: highlight the section being read
  const links = [...document.querySelectorAll(".toc a[href^='#']")];
  if (links.length && "IntersectionObserver" in window) {
    const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => a.removeAttribute("aria-current"));
        const a = map.get(e.target.id);
        if (a) a.setAttribute("aria-current", "true");
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }
})();
