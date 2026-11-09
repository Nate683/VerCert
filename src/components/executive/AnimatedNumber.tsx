"use client";

// Displays a live-polled figure. It used to count up toward each new value;
// the portal's design allows no motion beyond quiet state transitions, so the
// new value now simply replaces the old. The props are unchanged so callers
// don't change (`durationMs` is accepted and ignored).
export function AnimatedNumber({
  value,
  format = (n) => n.toFixed(2),
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
}) {
  return <>{format(value)}</>;
}
