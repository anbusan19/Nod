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
