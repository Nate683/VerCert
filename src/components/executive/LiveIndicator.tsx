"use client";

import type { Variant } from "./Chrome";

// The live mark: a steady gold dot (gold = live) and when the figures were last
// refreshed. `variant` no longer changes the look.
export function LiveIndicator({ asOf }: { variant: Variant; asOf?: string }) {
  // Safe to format inline: `asOf` only ever arrives from a client-side fetch,
  // so the server render and the first client render both see it undefined.
  const updated = asOf ? new Date(asOf).toLocaleTimeString() : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--x-gold)]" aria-hidden="true" />
      <span className="text-[11px] text-[var(--x-muted)]">
        Live — refreshes every 20 seconds
        {updated && ` · updated ${updated}`}
      </span>
    </div>
  );
}
