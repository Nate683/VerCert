export function ChangeBadge({ changePercent }: { changePercent: number | null }) {
  if (changePercent === null) return <span className="text-white/30">—</span>;
  const positive = changePercent >= 0;
  return (
    <span className={positive ? "text-emerald-400" : "text-red-300"}>
      {positive ? "▲" : "▼"} {Math.abs(changePercent).toFixed(1)}%
    </span>
  );
}
