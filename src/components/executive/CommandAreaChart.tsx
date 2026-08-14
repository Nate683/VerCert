"use client";

import { useEffect, useRef, useState } from "react";
import type { RevenuePoint } from "@/lib/executive/stats";

const WIDTH = 600;
const HEIGHT = 160;
const PADDING_Y = 12;

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

  const area = `${line} L ${(points[points.length - 1][0]).toFixed(1)} ${HEIGHT} L 0 ${HEIGHT} Z`;

  return { line, area };
}

// Command-exclusive: a refined animated area chart with a gold gradient fill
// and a stroke that draws itself in on mount.
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
    }, 50);
    return () => clearTimeout(timeout);
  }, [line]);

  const stepX = WIDTH / Math.max(1, series.length - 1);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-40 w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="command-revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c9a227" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#c9a227" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#command-revenue-fill)" className={`transition-opacity duration-1000 ${drawn ? "opacity-100" : "opacity-0"}`} />
        <path
          ref={pathRef}
          d={line}
          fill="none"
          stroke="#c9a227"
          strokeWidth={1.5}
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)" }}
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
                r={hoverIndex === i ? 4 : 0}
                fill="#c9a227"
                className="transition-all duration-200"
              />
            </g>
          );
        })}
      </svg>
      {hoverIndex !== null && series[hoverIndex] && (
        <div
          className="pointer-events-none absolute -top-9 -translate-x-1/2 whitespace-nowrap border border-gold/30 bg-black px-2 py-1 font-mono text-[10px] text-white"
          style={{ left: `${(hoverIndex * stepX * 100) / WIDTH}%` }}
        >
          {series[hoverIndex].date}: ${series[hoverIndex].revenue.toFixed(0)}
        </div>
      )}
    </div>
  );
}
