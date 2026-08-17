"use client";

import { useEffect, useRef, useState } from "react";
import type { RevenuePoint } from "@/lib/executive/stats";

const WIDTH = 600;
const HEIGHT = 170;
const PADDING_Y = 14;

const BRASS = "#b8912f";
const BRASS_BRIGHT = "#d9b45c";

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

// Command-exclusive: an engraved plot. Brass stroke over a ruled ledger
// grid, the curve drawing itself in slowly on mount — no bounce, no easing
// overshoot.
export function CommandAreaChart({ series }: { series: RevenuePoint[] }) {
  const pathRef = useRef<SVGPathElement>(null);
  const [drawn, setDrawn] = useState(false);
  const max = Math.max(1, ...series.map((p) => p.revenue));
  const { line, area } = buildPath(series, max);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const length = el.getTotalLength();
    el.style.strokeDasharray = `${length}`;
    el.style.strokeDashoffset = `${length}`;
    // Force reflow so the transition reliably plays from the initial offset.
    el.getBoundingClientRect();
    const timeout = setTimeout(() => {
      setDrawn(true);
      el.style.strokeDashoffset = "0";
    }, 60);
    return () => clearTimeout(timeout);
  }, [line]);

  const stepX = WIDTH / Math.max(1, series.length - 1);
  // Four ruled lines across the plot, labelled in brass down the left edge.
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
        <defs>
          <linearGradient id="command-revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRASS} stopOpacity="0.34" />
            <stop offset="70%" stopColor="#5c1a1b" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#5c1a1b" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridLines.map((fraction) => {
          const y = HEIGHT - PADDING_Y - fraction * (HEIGHT - PADDING_Y * 2);
          return (
            <line
              key={fraction}
              x1={0}
              x2={WIDTH}
              y1={y}
              y2={y}
              stroke={BRASS}
              strokeOpacity={0.13}
              strokeWidth={0.5}
              strokeDasharray="3 5"
            />
          );
        })}

        <path
          d={area}
          fill="url(#command-revenue-fill)"
          className={`transition-opacity duration-1000 ${drawn ? "opacity-100" : "opacity-0"}`}
        />
        <path
          ref={pathRef}
          d={line}
          fill="none"
          stroke={BRASS_BRIGHT}
          strokeWidth={1.5}
          strokeLinejoin="round"
          style={{ transition: "stroke-dashoffset 1.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
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
              <circle
                cx={x}
                cy={y}
                r={hoverIndex === i ? 3.5 : 0}
                fill={BRASS_BRIGHT}
                stroke="#0d0b0a"
                strokeWidth={1}
                className="transition-all duration-300"
              />
            </g>
          );
        })}
      </svg>

      {/* Scale, engraved down the left edge. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-between py-1">
        <span className="command-figure text-[9px] text-[var(--cmd-bone-faint)]">
          ${Math.round(max).toLocaleString()}
        </span>
        <span className="command-figure text-[9px] text-[var(--cmd-bone-faint)]">$0</span>
      </div>

      {hoverIndex !== null && series[hoverIndex] && (
        <div
          className="command-figure pointer-events-none absolute -top-8 z-10 -translate-x-1/2 whitespace-nowrap border border-[var(--cmd-brass)]/50 bg-[#0d0b0a] px-2 py-1 text-[10px] text-[var(--cmd-bone)] shadow-lg"
          style={{ left: `${(hoverIndex * stepX * 100) / WIDTH}%` }}
        >
          {series[hoverIndex].date} · ${series[hoverIndex].revenue.toFixed(0)}
        </div>
      )}
    </div>
  );
}
