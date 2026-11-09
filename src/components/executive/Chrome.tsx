// Shared chrome for the executive portal (/command and /office).
//
// One look for both: graphite sections with hairline borders, small muted
// uppercase labels, large tabular figures. The palette and type live in
// globals.css under .exec-shell; this file only lays the pieces out.
//
// `variant` is still accepted everywhere so callers don't change, but it no
// longer alters the look. `tone` and `engraved` are likewise accepted and
// ignored (they belonged to the previous leather-and-brass skin).

import type { ReactNode } from "react";

export type Variant = "command" | "office";

type Tone = "default" | "blood" | "green";

/** The base unit of both layouts: a titled section. */
export function Panel({
  title,
  meta,
  className = "",
  bodyClassName = "p-5",
  children,
}: {
  variant: Variant;
  title: string;
  /** Right-hand caption — a date range, a count, a period. */
  meta?: ReactNode;
  tone?: Tone;
  engraved?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`command-panel ${className}`}>
      <header className="exec-panel__head">
        <h3 className="exec-label">{title}</h3>
        {meta && <span className="exec-meta">{meta}</span>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A label/figure pair — the atom every dense readout is built from. */
export function Readout({
  label,
  children,
  footnote,
  size = "md",
  className = "",
}: {
  variant: Variant;
  label: string;
  children: ReactNode;
  footnote?: ReactNode;
  size?: "sm" | "md" | "lg" | "hero";
  className?: string;
}) {
  const sizeClass = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-3xl",
    hero: "text-4xl lg:text-5xl",
  }[size];

  return (
    <div className={className}>
      <p className="exec-label">{label}</p>
      <p className={`exec-figure mt-1.5 ${sizeClass}`}>{children}</p>
      {footnote && <div className="mt-1 text-[11px] text-[var(--x-muted)]">{footnote}</div>}
    </div>
  );
}

/** A hairline. (`crest` is accepted and ignored.) */
export function Rule({ className = "" }: { variant: Variant; crest?: boolean; className?: string }) {
  return <div className={`h-px w-full bg-[var(--x-border)] ${className}`} />;
}

/** Section label — small, uppercase, muted. */
export function Label({
  children,
  className = "",
}: {
  variant: Variant;
  children: ReactNode;
  className?: string;
}) {
  return <p className={`exec-label ${className}`}>{children}</p>;
}

/** Empty-state copy. */
export function Empty({ children }: { variant: Variant; children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[var(--x-muted)]">{children}</p>;
}
