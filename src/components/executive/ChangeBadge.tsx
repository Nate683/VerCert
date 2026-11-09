// A period-over-period change. Gains in the gold accent, losses in the
// desaturated negative tone; both resolve through the portal's tokens
// (globals.css, .exec-shell).
export function ChangeBadge({ changePercent }: { changePercent: number | null }) {
  if (changePercent === null) return <span className="text-[var(--x-faint)]">—</span>;
  const positive = changePercent >= 0;
  return (
    <span
      className={`font-medium tabular-nums ${positive ? "text-[var(--x-gold)]" : "text-[var(--x-negative)]"}`}
    >
      {positive ? "+" : "−"}
      {Math.abs(changePercent).toFixed(1)}%
    </span>
  );
}
