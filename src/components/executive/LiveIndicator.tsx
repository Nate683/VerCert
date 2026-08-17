"use client";

import type { Variant } from "./Chrome";

export function LiveIndicator({ variant, asOf }: { variant: Variant; asOf?: string }) {
  const isCommand = variant === "command";
  // Safe to format inline: `asOf` only ever arrives from a client-side fetch,
  // so the server render and the first client render both see it undefined.
  const updated = asOf ? new Date(asOf).toLocaleTimeString() : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`h-1.5 w-1.5 animate-pulse rounded-full ${
          isCommand ? "bg-[var(--cmd-brass)]" : "bg-[var(--office-gold)]"
        }`}
      />
      <span
        className={
          isCommand
            ? "command-label command-label--dim text-[11px] tracking-[0.2em]"
            : "office-label text-[10px]"
        }
      >
        Live — refreshes every 20 seconds
        {updated && ` · updated ${updated}`}
      </span>
    </div>
  );
}
