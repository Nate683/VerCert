"use client";

import { useEffect, useRef, useState } from "react";

// Smoothly tweens a displayed number toward `value` whenever it changes,
// so live-polled figures update with a subtle animated count rather than
// an abrupt jump.
export function AnimatedNumber({
  value,
  format = (n) => n.toFixed(2),
  durationMs = 700,
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return <>{format(display)}</>;
}
