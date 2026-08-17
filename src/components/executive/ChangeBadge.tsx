// Gains read as aged brass-green, losses as dried oxblood — the same warmth
// as the rest of the room, never stock-ticker neon. Both tones sit legibly on
// the Command leather and the Office navy.
export function ChangeBadge({ changePercent }: { changePercent: number | null }) {
  if (changePercent === null) return <span className="opacity-40">—</span>;
  const positive = changePercent >= 0;
  return (
    <span className={`command-figure text-[11px] ${positive ? "text-[#8fbc9c]" : "text-[#d79a92]"}`}>
      {positive ? "▲" : "▼"} {Math.abs(changePercent).toFixed(1)}%
    </span>
  );
}
