// Client-only. Scrolls the window so `el`'s top sits just below anything pinned to the top of the viewport (sticky or
// fixed headers), smoothly unless the visitor asked for reduced motion. Used by Executive Office → Stock to bring the
// opened SKU's detail panel into view (Stage 3 correction).

// The bottom edge of the lowest element pinned to the top of the viewport (0 when nothing is).
export function pinnedTopOffset(): number {
  let bottom = 0;
  for (const node of document.body.querySelectorAll<HTMLElement>("body *")) {
    const pos = getComputedStyle(node).position;
    if (pos !== "sticky" && pos !== "fixed") continue;
    const r = node.getBoundingClientRect();
    // Pinned at the top, visible, and spanning most of the width (a header bar, not a floating button or a sticky
    // table cell inside the page).
    if (r.height > 0 && r.top <= 1 && r.bottom > 0 && r.width >= window.innerWidth * 0.5) bottom = Math.max(bottom, r.bottom);
  }
  return bottom;
}

export function scrollElementIntoView(el: HTMLElement, gap = 12): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const top = window.scrollY + el.getBoundingClientRect().top - pinnedTopOffset() - gap;
  window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
}
