// Client-only. Waits until the page has stopped scrolling (scrollend where supported, otherwise until the scroll
// position has held still for a few frames, capped at 1.5s), then focuses an element without scrolling again — so
// a smooth scroll to the newsletter form ends with the cursor in its email field, with no second scroll or jump.
//
// On touch devices (coarse pointer) it focuses `fallback` instead (the section): focusing a text field there can
// raise the on-screen keyboard and resize the page mid-scroll. The next tap then lands in the field.
export function focusAfterScroll(field: HTMLElement, fallback?: HTMLElement | null): void {
  const target = window.matchMedia("(pointer: coarse)").matches ? fallback ?? null : field;
  if (!target) return;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener("scrollend", finish);
    target.focus({ preventScroll: true });
  };
  window.addEventListener("scrollend", finish, { once: true });
  // Fallback for browsers without scrollend, and for a scroll that never starts (already in place).
  let lastY = window.scrollY;
  let still = 0;
  let moved = false;
  const started = performance.now();
  const tick = () => {
    if (done) return;
    const y = window.scrollY;
    if (Math.abs(y - lastY) < 0.5) still += 1;
    else { still = 0; moved = true; }
    lastY = y;
    const elapsed = performance.now() - started;
    // Settled: it moved and has now held still, or it never moved within 300ms (already in place).
    if ((still >= 6 && (moved || elapsed > 300)) || elapsed > 1500) finish();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
