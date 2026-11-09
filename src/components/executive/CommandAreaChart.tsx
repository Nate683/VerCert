"use client";

import { useState } from "react";
import type { RevenuePoint } from "@/lib/executive/stats";

const WIDTH = 600;
const HEIGHT = 170;
const PADDING_Y = 14;

// Graphite chart colours (match .exec-shell in globals.css). SVG attributes
// can't take the CSS variables everywhere, so the values are repeated here.
const LINE = "#b9bec4";
const FILL = "#eceef0";
const GRID = "#272b30";
const BASE = "#111316";

function buildPath(series: RevenuePoint[], max: number) {
  if (series.length === 0) return { line: "", area: "" };
  const stepX = WIDTH / Math.max(1, series.length - 1);
  const points = series.map((p, i) => {
    const x = i * stepX;
    const y = HEIGHT - PADDING_Y - (p.revenue / max) * (HEIGHT - PADDING_Y * 2);
    return [x, y] as const;
  });

  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

  const area = `${line} L ${points[points.length - 1][0].toFixed(1)} ${HEIGHT} L 0 ${HEIGHT} Z`;

  return { line, area };
}

// Revenue over the trailing fourteen days: a plain line over hairline gridlines,
// a faint flat fill, a value on hover. No draw-in animation, no gradient.
export function CommandAreaChart({ series }: { series: RevenuePoint[] }) {
  const max = Math.max(1, ...series.map((p) => p.revenue));
  const { line, area } = buildPath(series, max);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const stepX = WIDTH / Math.max(1, series.length - 1);
  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-44 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label="Revenue over the trailing fourteen days"
      >
        {gridLines.map((fraction) => {
          const y = HEIGHT - PADDING_Y - fraction * (HEIGHT - PADDING_Y * 2);
          return (
            <line
              key={fraction}
              x1={0}
              x2={WIDTH}
              y1={y}
              y2={y}
              stroke={GRID}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        <path d={area} fill={FILL} fillOpacity={0.04} />
        <path
          d={line}
          fill="none"
          stroke={LINE}
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {series.map((point, i) => {
          const x = i * stepX;
          const y = HEIGHT - PADDING_Y - (point.revenue / max) * (HEIGHT - PADDING_Y * 2);
          return (
            <g key={point.date}>
              <rect
                x={x - stepX / 2}
                y={0}
                width={stepX}
                height={HEIGHT}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex((prev) => (prev === i ? null : prev))}
              />
              {hoverIndex === i && <circle cx={x} cy={y} r={3} fill={FILL} stroke={BASE} strokeWidth={1} />}
            </g>
          );
        })}
      </svg>

      {/* Scale down the left edge. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-between py-1">
        <span className="text-[10px] tabular-nums text-[var(--x-faint)]">${Math.round(max).toLocaleString()}</span>
        <span className="text-[10px] tabular-nums text-[var(--x-faint)]">$0</span>
      </div>

      {hoverIndex !== null && series[hoverIndex] && (
        <div
          className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 whitespace-nowrap border border-[var(--x-border-strong)] bg-[var(--x-base)] px-2 py-1 text-[11px] tabular-nums text-[var(--x-text)]"
          style={{ left: `${(hoverIndex * stepX * 100) / WIDTH}%` }}
        >
          {series[hoverIndex].date} · ${series[hoverIndex].revenue.toFixed(0)}
        </div>
      )}
    </div>
  );
}
