// Page behaviour: nav, scroll reveal, the walkthrough, the claim-vs-reality toggle, the limits slider.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Placeholder links (APK, repo) go nowhere yet; do not jump to the top of the page.
  $$("[data-todo]").forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));

  // Nav gets a hairline once the page has scrolled.
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Reveal on scroll.
  const revealIO = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); }
  }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  $$(".reveal").forEach((el) => revealIO.observe(el));

  // Cursor spotlight on the feature cards.
  $$(".spot").forEach((card) => card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  }));

  // ---------- 01 walkthrough ----------
  const stage = $("#stage");
  if (stage) {
    const buttons = $$("#demoSteps button");
    const titles = ["agent · demo-agent", "Nod · approval", "Nod · hold to approve", "Nod · signed by your wallet"];
    const DUR = [4400, 4800, 3800, 3600];
    const timerEl = $("#timer"), afterEl = $("#balanceAfter"), stageTitle = $("#stageTitle");
    let step = 0, elapsed = 0, last = 0, inView = false, raf = 0, countRaf = 0;

    const countBalance = () => {
      cancelAnimationFrame(countRaf);
      const from = 1.24, to = 1.19, t0 = performance.now() + 1000, d = 900;
      afterEl.textContent = from.toFixed(4);
      const tick = (now) => {
        const k = Math.min(1, Math.max(0, (now - t0) / d));
        afterEl.textContent = (from + (to - from) * (1 - Math.pow(1 - k, 3))).toFixed(4);
        if (k < 1) countRaf = requestAnimationFrame(tick);
      };
      countRaf = requestAnimationFrame(tick);
    };

    const go = (n) => {
      step = n; elapsed = 0;
      stage.dataset.step = String(n);
      stageTitle.textContent = titles[n];
      buttons.forEach((b, i) => {
        b.setAttribute("aria-current", i === n ? "true" : "false");
        b.style.setProperty("--p", "0");
      });
      if (n === 1) countBalance();
      if (n === 0) afterEl.textContent = "1.1900";
    };

    const frame = (now) => {
      raf = 0;
      if (!inView || document.hidden) { last = 0; return; }
      const dt = last ? Math.min(100, now - last) : 0;
      last = now;
      elapsed += dt;
      const p = Math.min(1, elapsed / DUR[step]);
      buttons[step].style.setProperty("--p", p.toFixed(3));
      if (step === 1 || step === 2) {
        const left = 58 - (step === 2 ? 4 : 0) - Math.floor(elapsed / 1000);
        timerEl.textContent = `expires in 0:${String(Math.max(0, left)).padStart(2, "0")}`;
      }
      if (elapsed >= DUR[step]) go((step + 1) % 4);
      raf = requestAnimationFrame(frame);
    };
    const kick = () => { if (!raf && !reduced) { last = 0; raf = requestAnimationFrame(frame); } };

    buttons.forEach((b, i) => b.addEventListener("click", () => { go(i); kick(); }));

    let seen = false;
    new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (inView && !seen) { seen = true; stage.removeAttribute("data-step"); void stage.offsetWidth; go(0); }
      kick();
    }, { threshold: 0.35 }).observe(stage);
    document.addEventListener("visibilitychange", kick);
    go(reduced ? 1 : 0);
  }

  // ---------- 02 claim vs reality ----------
  const cmp = $("#compare");
  if (cmp) {
    const tabs = $$("[data-mode]", cmp);
    let timer = 0, touched = false, visible = false;
    const setMode = (m) => {
      cmp.dataset.mode = m;
      tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.mode === m)));
    };
    tabs.forEach((t) => t.addEventListener("click", () => { touched = true; clearInterval(timer); setMode(t.dataset.mode); }));
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      clearInterval(timer);
      if (visible && !touched && !reduced) timer = setInterval(() => setMode(cmp.dataset.mode === "honest" ? "liar" : "honest"), 4200);
    }, { threshold: 0.4 }).observe(cmp);
  }

  // ---------- 03 limits ----------
  const range = $("#limitRange");
  if (range) {
    const AUTO = 0.1, CAP = 3;
    const amountEl = $("#limitAmount"), outcome = $("#outcome"), tiers = $$("#tiers article");
    const text = {
      auto: (a) => `${a} SOL is under the auto limit: it goes through without a prompt and lands in your activity feed.`,
      nod: (a) => `${a} SOL needs you: your phone buzzes, decodes it, and waits for your Nod.`,
      block: (a) => `${a} SOL is over the hard cap: refused automatically, and the agent is told why.`,
    };
    const apply = () => {
      const v = Number(range.value) / 100;
      const tier = v <= AUTO ? "auto" : v <= CAP ? "nod" : "block";
      const a = v.toFixed(2);
      amountEl.textContent = a;
      outcome.textContent = text[tier](a);
      tiers.forEach((t) => t.classList.toggle("active", t.dataset.tier === tier));
    };
    range.addEventListener("input", () => { touched = true; apply(); });
    let touched = false, played = false;
    // One gentle sweep the first time it is seen, so it is clear the amount is draggable.
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
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !played) { played = true; if (!reduced) sweep(); }
    }, { threshold: 0.5 }).observe(range);
    apply();
  }

  // ---------- 05 copy ----------
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
})();
