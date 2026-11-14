"use client";

import { useEffect, useRef, useState } from "react";

// Wraps children in a scroll-triggered fade-in — restrained motion, no
// bounce/overshoot. Falls back to always-visible if IntersectionObserver
// isn't available (never hides content on old browsers/SSR mismatch).
export function ScrollReveal({
  children,
  className = "",
  delayMs = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    // Reveal when 15% of the element is on screen, OR when the element fills
    // 15% of the viewport's height, whichever comes first. The second rule is
    // for elements taller than the screen: on a phone the featured grid is
    // ~2,800px tall, so 15% of it (~420px) could be on screen, first vial
    // included, while the wrapper stayed at opacity 0, and a Back navigation
    // restored straight into that state. For anything shorter than the
    // viewport the first rule always fires first, so its timing is unchanged.
    const reveal = ([entry]: IntersectionObserverEntry[]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      byElement.disconnect();
      byViewport.disconnect();
    };
    const byElement = new IntersectionObserver(reveal, { threshold: 0.15 });
    const byViewport = new IntersectionObserver(reveal, { rootMargin: "-15% 0px -15% 0px", threshold: 0 });
    byElement.observe(el);
    byViewport.observe(el);
    return () => {
      byElement.disconnect();
      byViewport.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`scroll-reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
