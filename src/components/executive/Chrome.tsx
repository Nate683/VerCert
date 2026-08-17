// Shared chrome for the two executive terminals.
//
// /command is a 1970s private-club back room: oxblood leather panels with
// engraved brass plaques for headers, guilloche banknote lathe-work behind
// the headline figures, marble in the masthead, and thin double gold rules
// throughout. /office is the same information in a lighter navy-and-platinum
// room — clearly a different room in the same building.
//
// The materials themselves live in globals.css; this file only decides which
// material each piece of furniture is made of.

import type { ReactNode } from "react";

export type Variant = "command" | "office";

type Tone = "default" | "blood" | "green";

/** The base unit of both layouts: a titled panel. */
export function Panel({
  variant,
  title,
  meta,
  tone = "default",
  engraved = false,
  className = "",
  bodyClassName = "p-5",
  children,
}: {
  variant: Variant;
  title: string;
  /** Right-hand caption on the plaque — a date stamp, a count, a period. */
  meta?: ReactNode;
  tone?: Tone;
  /** Lays the guilloche rosette behind the panel. Reserve it for headline figures. */
  engraved?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  if (variant === "office") {
    return (
      <section className={`office-card !p-0 ${className}`}>
        <header className="flex items-center justify-between gap-3 border-b border-[var(--office-border)] px-5 py-3">
          <h3 className="office-label">{title}</h3>
          {meta && <span className="text-[11px] office-platinum">{meta}</span>}
        </header>
        <div className={bodyClassName}>{children}</div>
      </section>
    );
  }

  const toneClass =
    tone === "blood" ? "command-panel--blood" : tone === "green" ? "command-panel--green" : "";

  return (
    <section className={`command-card command-panel ${toneClass} ${className}`}>
      <div className="p-3 pb-0">
        <header className="command-plaque">
          <h3 className="command-plaque__text">{title}</h3>
          {meta && <span className="command-plaque__meta">{meta}</span>}
        </header>
      </div>
      <div className={`${engraved ? "command-engraved" : ""} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** A label/figure pair — the atom every dense readout is built from. */
export function Readout({
  variant,
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
  const isCommand = variant === "command";
  const sizeClass = {
    sm: isCommand ? "text-base" : "text-base font-semibold",
    md: isCommand ? "text-xl" : "text-xl font-semibold",
    lg: isCommand ? "text-3xl" : "text-2xl font-semibold",
    hero: isCommand ? "text-5xl lg:text-6xl" : "text-4xl font-semibold",
  }[size];

  return (
    <div className={className}>
      <p
        className={
          isCommand
            ? "command-label command-label--dim text-[11px]"
            : "office-label text-[10px]"
        }
      >
        {label}
      </p>
      <p
        className={
          isCommand
            ? `mt-1.5 ${size === "hero" ? "command-hero-figure" : "command-figure"} ${sizeClass}`
            : `mt-1.5 office-gold ${sizeClass}`
        }
      >
        {children}
      </p>
      {footnote && (
        <div className={isCommand ? "mt-1 text-[11px] text-[var(--cmd-bone-dim)]" : "mt-1 text-[11px] office-platinum"}>
          {footnote}
        </div>
      )}
    </div>
  );
}

/** Thin double gold rule, art-deco. `crest` adds the centre diamond. */
export function Rule({ variant, crest = false, className = "" }: { variant: Variant; crest?: boolean; className?: string }) {
  if (variant === "office") {
    return <div className={`h-px w-full bg-[var(--office-border)] ${className}`} />;
  }
  return <div className={`command-rule ${crest ? "command-rule--crest" : ""} ${className}`} />;
}

/** Section label — small caps and letterspaced in Command, plain in Office. */
export function Label({
  variant,
  children,
  className = "",
}: {
  variant: Variant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`${variant === "command" ? "command-label" : "office-label"} ${className}`}>
      {children}
    </p>
  );
}

/** Empty-state copy that still reads as part of the room. */
export function Empty({ variant, children }: { variant: Variant; children: ReactNode }) {
  return (
    <p
      className={
        variant === "command"
          ? "command-body py-6 text-center text-sm text-[var(--cmd-bone-faint)]"
          : "py-6 text-center text-sm office-platinum"
      }
    >
      {children}
    </p>
  );
}
