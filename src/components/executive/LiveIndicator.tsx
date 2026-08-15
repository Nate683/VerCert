"use client";

export function LiveIndicator({ variant, asOf }: { variant: "command" | "office"; asOf?: string }) {
  const isCommand = variant === "command";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`h-2 w-2 rounded-full animate-pulse ${isCommand ? "bg-gold" : "bg-[var(--office-gold)]"}`}
      />
      <span
        className={`text-[11px] uppercase tracking-[0.25em] ${
          isCommand ? "text-white/40" : "text-[var(--office-fg)]/50"
        }`}
      >
        Live — refreshes every 20s
        {asOf && ` · updated ${new Date(asOf).toLocaleTimeString()}`}
      </span>
    </div>
  );
}
