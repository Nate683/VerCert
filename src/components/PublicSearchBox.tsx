"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { searchScore } from "@/lib/search";
import { usd, type PublicCompound } from "@/lib/catalog-public";

// The SIGNED-OUT header search (Website Refinements Package 1; presentation refined in Visual Package 2). The
// signed-in search (SearchBox.tsx) is unchanged.
// - The field: a thin, understated gold border on a slate blue a step lighter than the header (--search-slate).
// - Placeholder: "VIEW COMPOUNDS & PRICES" (gold) shows first and stays longer; "SEARCH COMPOUNDS" (navigation gray)
//   follows; a soft fade between them. Rotation stops on focus or once anything is typed. The dynamic compound count
//   is no longer in the placeholder; it stays on the View All action and list.
// - As the visitor types: matching compounds by name, alternate name or CAS number (the same scoring as the shop
//   search, lib/search.ts), each with its existing photo and its strengths with their current prices, on a charcoal
//   dropdown. Names and strengths in the navigation-gray family, prices in brand gold.
// - "VIEW ALL N COMPOUNDS & PRICES →" opens a compact alphabetical list (not the shop, not product cards).
// - Choosing a compound or a strength goes to /register: the catalog itself stays registration-gated.
// Colour/contrast measurements: VERICERT_WEBSITE_VISUAL_REFINEMENTS_PACKAGE_2_REPORT.md.

// The pricing phrase first and longer; the search phrase shorter. A restrained difference, not a flash.
// At full desktop width (xl, the 204px slot) the pricing phrase is "COMPOUNDS & PRICES": the full phrase is 185px of
// text in 154px of room there (owner decision, 2026-11-23). Narrower layouts, where the field is wider, keep the full
// phrase. Chosen by CSS breakpoint, so there's no flash and no JavaScript measuring.
const PHRASES = [
  { text: "VIEW COMPOUNDS & PRICES", desktopText: "COMPOUNDS & PRICES", className: "text-gold", holdMs: 4500 },
  { text: "SEARCH COMPOUNDS", desktopText: null, className: "text-white/70", holdMs: 2500 },
] as const;
const FADE_MS = 300;
let cache: { count: number; compounds: PublicCompound[] } | null = null;
let inflight: Promise<{ count: number; compounds: PublicCompound[] }> | null = null;
function loadPublicCatalog() {
  if (cache) return Promise.resolve(cache);
  inflight ??= fetch("/api/public-catalog")
    .then((r) => (r.ok ? r.json() : { count: 0, compounds: [] }))
    .then((d) => (cache = { count: d.count ?? 0, compounds: d.compounds ?? [] }))
    .catch(() => ({ count: 0, compounds: [] }))
    .finally(() => { inflight = null; });
  return inflight;
}

function Price({ price }: { price: PublicCompound["strengths"][number]["price"] }) {
  return price.effectiveUsd < price.regularUsd ? (
    <>
      <span>{usd(price.effectiveUsd)}</span> <span className="line-through opacity-60">{usd(price.regularUsd)}</span>
    </>
  ) : (
    <span>{usd(price.regularUsd)}</span>
  );
}

export function PublicSearchBox({ onNavigate, idSuffix = "" }: { onNavigate?: () => void; idSuffix?: string }) {
  const router = useRouter();
  const [data, setData] = useState(cache);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [phrase, setPhrase] = useState(0);
  const [fading, setFading] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `public-compound-search${idSuffix}`;
  const listboxId = `public-compound-results${idSuffix}`;

  useEffect(() => {
    let cancelled = false;
    loadPublicCatalog().then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, []);

  const count = data?.count ?? 0;
  const rotating = !focused && query === "";
  // Each phrase holds for its own time, then fades out, swaps, and fades in.
  useEffect(() => {
    if (!rotating) return;
    const hold = setTimeout(() => setFading(true), PHRASES[phrase].holdMs);
    const swap = setTimeout(() => { setPhrase((p) => (p + 1) % PHRASES.length); setFading(false); }, PHRASES[phrase].holdMs + FADE_MS);
    return () => { clearTimeout(hold); clearTimeout(swap); };
  }, [rotating, phrase]);
  const current = PHRASES[phrase];

  const results = useMemo(() => {
    if (!data || !query.trim()) return [];
    return data.compounds
      .map((c) => ({ c, score: searchScore({ name: c.name, alternateNames: c.alternateNames, casNumber: c.casNumber, category: null }, query) }))
      .filter((r): r is { c: PublicCompound; score: number } => r.score !== null)
      .sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name))
      .slice(0, 8)
      .map((r) => r.c);
  }, [data, query]);
  const activeIndex = Math.min(highlight, Math.max(0, results.length - 1));

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function toRegister() {
    setOpen(false);
    setListOpen(false);
    setQuery("");
    onNavigate?.();
    router.push("/register");
  }
  function openList() {
    setOpen(false);
    setListOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((activeIndex + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((activeIndex - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); toRegister(); }
  }

  const viewAllLabel = `View All ${count > 0 ? `${count} ` : ""}Compounds & Prices`;
  return (
    <div ref={containerRef} className="relative w-full" data-public-search>
      <label htmlFor={inputId} className="sr-only">Compound search: search compounds by name or CAS number</label>
      <div className="relative flex items-center gap-2 border border-gold/40 bg-[var(--search-slate)] px-3 font-sans transition-colors hover:border-gold/60 focus-within:border-gold" data-public-field>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-white/60" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <div className="relative min-w-0 flex-1">
          <input
            id={inputId}
            ref={inputRef}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlight(0); setOpen(true); }}
            onFocus={() => { setFocused(true); setOpen(true); }}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            className="w-full min-w-0 bg-transparent py-2.5 font-sans text-[13px] text-white focus:outline-none"
          />
          {/* The rotating placeholder: a real placeholder attribute can't fade, so this sits over the empty field. */}
          {query === "" && (
            <span
              aria-hidden="true"
              data-placeholder
              data-phrase={phrase}
              className={`pointer-events-none absolute inset-0 flex min-w-0 items-center overflow-hidden whitespace-nowrap font-sans text-[13px] uppercase transition-opacity ease-in-out ${current.className}`}
              style={{ opacity: fading ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
            >
              {/* Bounded on both sides, so text longer than the field ends in an ellipsis inside the border instead of
                  running out over it. */}
              {current.desktopText ? (
                <>
                  <span className="min-w-0 truncate xl:hidden">{current.text}</span>
                  <span className="hidden min-w-0 truncate xl:inline">{current.desktopText}</span>
                </>
              ) : (
                <span className="min-w-0 truncate">{current.text}</span>
              )}
            </span>
          )}
        </div>
        {query && (
          <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear search" className="shrink-0 text-white/60 transition-colors hover:text-gold">×</button>
        )}
      </div>

      {open && (
        <div
          id={listboxId}
          className="pop-in absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] min-w-[18rem] overflow-y-auto border border-white/10 bg-charcoal shadow-[0_24px_48px_-12px_rgba(0,0,0,0.7)] md:left-auto md:w-[26rem]"
          data-public-results
        >
          {query.trim() !== "" && (!data ? (
            <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 w-full" />)}</div>
          ) : results.length === 0 ? (
            <div className="p-5 text-center" data-no-match>
              <p className="text-sm text-white/75">No match for &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-xs text-white/60">Try a compound name, or its CAS number.</p>
            </div>
          ) : (
            <>
              <ul role="listbox" aria-label="Matching compounds" className="divide-y divide-white/[0.06]">
                {results.map((c, i) => (
                  <li key={c.slug} role="option" aria-selected={i === activeIndex} onMouseEnter={() => setHighlight(i)}
                    className={`flex gap-3 px-3 py-3 transition-colors ${i === activeIndex ? "bg-white/[0.04]" : ""}`} data-public-result={c.slug}>
                    {/* One thumbnail per compound: the existing photo, shown whole (contain), never stretched. */}
                    <Link href="/register" onClick={(e) => { e.preventDefault(); toRegister(); }} tabIndex={-1} aria-hidden="true"
                      className="relative h-14 w-14 shrink-0 overflow-hidden border border-white/10 bg-navy-deep" data-public-thumb>
                      {c.imageUrl && <Image src={c.imageUrl} alt="" fill sizes="56px" className="object-contain" />}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href="/register" onClick={(e) => { e.preventDefault(); toRegister(); }} className="block truncate text-sm text-white/75 transition-colors hover:text-gold" data-public-name>
                        {c.name}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {c.strengths.map((s) => (
                          <Link key={s.label} href="/register" onClick={(e) => { e.preventDefault(); toRegister(); }}
                            className="border border-white/10 px-2 py-0.5 text-[11px] text-white/60 transition-colors hover:border-gold/60" data-public-strength>
                            {s.label} · <span className="text-gold" data-public-price><Price price={s.price} /></span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="border-t border-white/[0.06] px-3 py-2.5 text-[11px] text-white/60" data-register-note>
                Select a compound to view details — free registration required.
              </p>
            </>
          ))}
          <button type="button" onClick={openList}
            className={`block w-full px-3 py-3 text-center text-xs uppercase tracking-[0.15em] text-gold/85 transition-colors hover:text-gold ${query.trim() ? "border-t border-white/10" : ""}`}
            data-view-all>
            {viewAllLabel} <span aria-hidden="true">→</span>
          </button>
        </div>
      )}

      {/* Rendered on document.body: the header establishes a containing block (backdrop blur), which would otherwise
          confine this full-screen sheet to the header's own box. */}
      {listOpen && data && createPortal(
        <CompoundList compounds={data.compounds} title={viewAllLabel} onClose={() => setListOpen(false)} onChoose={toRegister} />,
        document.body
      )}
    </div>
  );
}

// The "View All" list: every compound on sale, alphabetical, with its strengths and prices. A centred sheet with a
// navy header over a white list; Escape or the close button closes it; choosing anything goes to /register.
// On white, the navigation gray itself would be unreadable (about 1.9:1), so names and strengths use the site's
// existing gray for text on white (--muted, 5.02:1) — names a step larger and heavier — and prices the darker gold for
// text on light grounds (--gold-ink, 5.31:1), semibold: the strongest text in each row.
function CompoundList({ compounds, title, onClose, onChoose }: { compounds: PublicCompound[]; title: string; onClose: () => void; onChoose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  const sorted = [...compounds].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-navy-deep/70 px-4 py-6 sm:items-center sm:py-12" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-compound-list>
      <div role="dialog" aria-modal="true" aria-labelledby="compound-list-title" className="flex max-h-full w-full max-w-2xl flex-col border border-navy bg-paper shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between gap-4 bg-navy px-5 py-4" data-list-header>
          <h2 id="compound-list-title" className="text-xs uppercase tracking-[0.22em] text-gold">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close the compound list" className="px-2 text-lg leading-none text-white/70 transition-colors hover:text-white" data-close-list>×</button>
        </div>
        <ul className="divide-y divide-hairline overflow-y-auto px-5" data-compound-rows>
          {sorted.map((c) => (
            <li key={c.slug} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6" data-compound-row={c.slug}>
              <Link href="/register" onClick={(e) => { e.preventDefault(); onChoose(); }} className="text-sm font-medium text-muted transition-colors hover:text-navy" data-list-name>{c.name}</Link>
              <span className="flex flex-wrap gap-x-4 gap-y-1 sm:justify-end">
                {c.strengths.map((s) => (
                  <Link key={s.label} href="/register" onClick={(e) => { e.preventDefault(); onChoose(); }} className="whitespace-nowrap text-[12px] text-muted transition-colors hover:text-navy" data-list-strength>
                    {s.label} <span className="ml-1 font-semibold text-gold-ink" data-list-price><Price price={s.price} /></span>
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 border-t border-hairline bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6" data-list-register>
          <p className="text-xs leading-relaxed text-muted" data-list-register-text>
            Compound names, strengths and public prices can be viewed without an account. Registration is required for
            full product details, inventory availability and purchasing.
          </p>
          <Link href="/register" onClick={(e) => { e.preventDefault(); onChoose(); }}
            className="shrink-0 border border-gold bg-gold px-5 py-2.5 text-center text-xs uppercase tracking-[0.18em] text-black transition-colors hover:border-gold-ink hover:bg-transparent hover:text-gold-ink" data-list-cta>
            Create Your Free Account
          </Link>
        </div>
      </div>
    </div>
  );
}
