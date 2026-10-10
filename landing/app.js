// Page behaviour: nav, reveal, dithered tiles, walkthrough rows, claim-vs-reality, limits, use cases.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cssVar = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

  // Placeholder links (APK, repo, docs) go nowhere yet; do not jump to the top of the page.
  $$("[data-todo]").forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));

  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Reveal on scroll.
  const revealIO = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); }
  }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  $$(".reveal, .code").forEach((el) => revealIO.observe(el));

  // Ordered-dither matrix, shared by the tiles.
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

  // ---------- coloured tiles: a field of squares that dither lighter along a slow diagonal wave ----------
  const tiles = $$(".tile, .fit-big").map((box) => ({ box, canvas: $(".tile-bg", box), cols: 0, rows: 0, cell: 0, vis: false }));
  const CELL = 22;
  const sizeTile = (t) => {
    const r = t.box.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    t.canvas.width = Math.round(r.width * dpr); t.canvas.height = Math.round(r.height * dpr);
    t.ctx = t.canvas.getContext("2d"); t.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    t.cell = CELL; t.cols = Math.ceil(r.width / CELL); t.rows = Math.ceil(r.height / CELL);
    t.w = r.width; t.h = r.height;
  };
  const paintTile = (t, time) => {
    const { ctx, cols, rows, cell } = t;
    ctx.clearRect(0, 0, t.w, t.h);
    const wave = (time / 9000) % 1;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const d = (x / cols + y / rows) / 2;
      // Base gradient lightens toward the top-left; a wave of extra light drifts across.
      let level = Math.max(0, 0.62 - d * 0.9) + 0.22 * Math.max(0, 1 - Math.abs(d - (wave * 1.6 - 0.3)) / 0.18);
      if (level > bayer[y & 7][x & 7]) {
        const hi = level > 0.55 ? 0.34 : 0.2;
        ctx.fillStyle = `rgba(255,255,255,${hi})`;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  };
  tiles.forEach((t) => { sizeTile(t); paintTile(t, 0); });
  const tileRO = new ResizeObserver((entries) => entries.forEach((e) => {
    const t = tiles.find((x) => x.box === e.target); if (t) { sizeTile(t); paintTile(t, performance.now()); }
  }));
  tiles.forEach((t) => tileRO.observe(t.box));
  let tileRaf = 0, lastPaint = 0;
  const tileLoop = (now) => {
    tileRaf = 0;
    if (now - lastPaint > 110) { lastPaint = now; tiles.forEach((t) => t.vis && paintTile(t, now)); }
    if (!document.hidden && tiles.some((t) => t.vis)) tileRaf = requestAnimationFrame(tileLoop);
  };
  const tileIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => { const t = tiles.find((x) => x.box === e.target); if (t) t.vis = e.isIntersecting; });
    if (!reduced && !tileRaf) tileRaf = requestAnimationFrame(tileLoop);
  });
  tiles.forEach((t) => tileIO.observe(t.box));

  // ---------- statement: rays and tags ----------
  const rays = $("#rays");
  if (rays) {
    const ns = "http://www.w3.org/2000/svg";
    for (let i = 0; i <= 12; i++) {
      for (const side of [0, 1000]) {
        const l = document.createElementNS(ns, "line");
        l.setAttribute("x1", "500"); l.setAttribute("y1", "150");
        l.setAttribute("x2", String(side)); l.setAttribute("y2", String(i * 25));
        rays.appendChild(l);
      }
    }
  }
  const chips = $$("#cloud span");
  if (chips.length && !reduced) {
    let hot = [];
    setInterval(() => {
      if (document.hidden) return;
      hot.forEach((c) => c.classList.remove("hot"));
      hot = [];
      while (hot.length < 3) { const c = chips[Math.floor(Math.random() * chips.length)]; if (!hot.includes(c)) hot.push(c); }
      hot.forEach((c) => c.classList.add("hot"));
    }, 1500);
  } else chips.slice(0, 3).forEach((c) => c.classList.add("hot"));

  // ---------- walkthrough: side list follows the row in view ----------
  const sideBtns = $$("#side button");
  const rowEls = sideBtns.map((b) => document.getElementById(b.dataset.target));
  sideBtns.forEach((b) => b.addEventListener("click", () => {
    document.getElementById(b.dataset.target).scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  }));
  const spyIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const tile = $(".tile", e.target);
      if (tile) tile.classList.toggle("play", e.isIntersecting);
    });
    const active = rowEls.map((el, i) => ({ i, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.top < innerHeight * 0.6 && x.r.bottom > innerHeight * 0.25)
      .sort((a, b) => Math.abs(a.r.top + a.r.height / 2 - innerHeight / 2) - Math.abs(b.r.top + b.r.height / 2 - innerHeight / 2))[0];
    if (active) sideBtns.forEach((b, i) => b.setAttribute("aria-current", String(i === active.i)));
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  rowEls.forEach((el) => spyIO.observe(el));

  // ---------- phone loop: decode -> hold -> signed ----------
  const phone = $("#phone");
  if (phone) {
    const states = [["decode", 2400], ["hold", 1900], ["scan", 2900], ["signed", 2800]];
    let i = 0, timer = 0, visible = false;
    const run = () => {
      clearTimeout(timer);
      if (!visible) return;
      phone.dataset.state = states[i][0];
      timer = setTimeout(() => { i = (i + 1) % states.length; run(); }, states[i][1]);
    };
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { i = 0; run(); } else clearTimeout(timer); }, { threshold: 0.4 }).observe(phone);
    if (reduced) phone.dataset.state = "signed";
  }

  // ---------- claim vs reality ----------
  const cmp = $("#compare");
  if (cmp) {
    const tabs = $$("[data-mode]", cmp);
    let timer = 0, touched = false;
    const setMode = (m) => { cmp.dataset.mode = m; tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.mode === m))); };
    tabs.forEach((t) => t.addEventListener("click", () => { touched = true; clearInterval(timer); setMode(t.dataset.mode); }));
    new IntersectionObserver(([e]) => {
      clearInterval(timer);
      if (e.isIntersecting && !touched && !reduced) timer = setInterval(() => setMode(cmp.dataset.mode === "honest" ? "liar" : "honest"), 4200);
    }, { threshold: 0.4 }).observe(cmp);
  }

  // ---------- limits ----------
  const range = $("#limitRange");
  if (range) {
    const AUTO = 0.1, CAP = 3;
    const amountEl = $("#limitAmount"), outcome = $("#outcome"), tierEls = $$("#tiers article");
    const text = {
      auto: (a) => `${a} SOL is under the auto limit: it goes through without a prompt.`,
      nod: (a) => `${a} SOL needs you: your phone buzzes and waits for your Nod.`,
      block: (a) => `${a} SOL is over the hard cap: refused automatically.`,
    };
    let touched = false, played = false;
    const apply = () => {
      const v = Number(range.value) / 100;
      const tier = v <= AUTO ? "auto" : v <= CAP ? "nod" : "block";
      const a = v.toFixed(2);
      amountEl.textContent = a; outcome.textContent = text[tier](a);
      tierEls.forEach((t) => t.classList.toggle("active", t.dataset.tier === tier));
    };
    range.addEventListener("input", () => { touched = true; apply(); });
    const path = [[0, 5], [0.28, 5], [0.5, 150], [0.75, 420], [1, 5]];
    const sweep = () => {
      const t0 = performance.now(), D = 6500;
      const tick = (now) => {
        if (touched) return;
        const k = Math.min(1, (now - t0) / D);
        let i = 0; while (i < path.length - 2 && k > path[i + 1][0]) i++;
        const [k0, v0] = path[i], [k1, v1] = path[i + 1];
        const u = (k - k0) / (k1 - k0 || 1);
        range.value = String(Math.round(v0 + (v1 - v0) * (u * u * (3 - 2 * u))));
        apply();
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    new IntersectionObserver(([e]) => { if (e.isIntersecting && !played) { played = true; if (!reduced) sweep(); } }, { threshold: 0.5 }).observe(range);
    apply();
  }

  // ---------- use cases ----------
  const fitBody = $("#fitBody");
  if (fitBody) {
    const tabs = $$("#fitTabs button");
    let idx = 0, timer = 0, touched = false;
    const show = (n) => {
      idx = n; fitBody.dataset.case = String(n);
      tabs.forEach((t, i) => t.setAttribute("aria-selected", String(i === n)));
    };
    tabs.forEach((t, i) => t.addEventListener("click", () => { touched = true; clearInterval(timer); show(i); }));
    new IntersectionObserver(([e]) => {
      clearInterval(timer);
      if (e.isIntersecting && !touched && !reduced) timer = setInterval(() => show((idx + 1) % tabs.length), 6000);
    }, { threshold: 0.4 }).observe(fitBody);
  }

  // ---------- copy ----------
  const copy = $("#copyBtn");
  if (copy) copy.addEventListener("click", async () => {
    const text = copy.dataset.copy;
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {} ta.remove();
    }
    const old = copy.textContent; copy.textContent = "Copied";
    setTimeout(() => { copy.textContent = old; }, 1600);
  });

  // ---------- footer knot: the same Braille dots, drawn once, sitting on the stripes ----------
  const foot = $("#footKnot"), rows = window.NOD_KNOT;
  if (foot && rows) {
    const BITS = [[0, 0, 1], [0, 1, 2], [0, 2, 4], [1, 0, 8], [1, 1, 16], [1, 2, 32], [0, 3, 64], [1, 3, 128]];
    const W = rows[0].length * 2, H = rows.length * 4;
    const draw = () => {
      const r = foot.getBoundingClientRect(); if (!r.width) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      foot.width = Math.round(r.width * dpr); foot.height = Math.round(r.height * dpr);
      const ctx = foot.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cell = Math.min(r.width / W, r.height / H);
      ctx.fillStyle = cssVar(document.documentElement, "--accent") || "#99ACFF";
      rows.forEach((row, cy) => [...row].forEach((ch, cx) => {
        const m = ch.codePointAt(0) - 0x2800;
        for (const [dx, dy, bit] of BITS) if (m & bit) {
          ctx.beginPath();
          ctx.arc(((cx * 2 + dx) + 0.5) * cell, ((cy * 4 + dy) + 0.5) * cell, cell * 0.4, 0, 6.2832);
          ctx.fill();
        }
      }));
    };
    draw();
    new ResizeObserver(draw).observe(foot);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);
  }
})();
