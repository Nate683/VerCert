"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { searchScore } from "@/lib/search";
import { usd, type PublicCompound } from "@/lib/catalog-public";

// The SIGNED-OUT header search (Website Refinements Package 1). The signed-in search (SearchBox.tsx) is unchanged.
// - Placeholder alternates "Compound Search" / "Explore N Compounds" with a soft fade about every three seconds; N is
//   the number of compounds on sale (several strengths of one compound count once). It stops rotating on focus or
//   once anything is typed, and only shows a number once the real count has loaded.
// - As the visitor types: matching compounds by name, alternate name or CAS number (the same scoring as the shop
//   search, lib/search.ts), each with its existing photo and its strengths with their current prices.
// - "View All N Compounds & Prices" opens a compact alphabetical list (not the shop, not product cards).
// - Choosing a compound or a strength goes to /register: the catalog itself stays registration-gated.
// Same field, font size and dimensions as the signed-in box.

const ROTATE_MS = 3000;
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
  const phrases = count > 0 ? ["Compound Search", `Explore ${count} Compounds`] : ["Compound Search"];
  const rotating = phrases.length > 1 && !focused && query === "";
  useEffect(() => {
    if (!rotating) return;
    let swap: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      setFading(true);
      swap = setTimeout(() => { setPhrase((p) => (p + 1) % 2); setFading(false); }, FADE_MS);
    }, ROTATE_MS);
    return () => { clearInterval(timer); if (swap) clearTimeout(swap); };
  }, [rotating]);
  const placeholder = phrases[phrase % phrases.length];

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
      <div className="relative flex items-center gap-2 border border-white/20 bg-white/[0.10] px-3 font-sans transition-colors hover:border-white/30 focus-within:border-gold">
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
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center truncate whitespace-nowrap font-sans text-[13px] text-white/[0.72] transition-opacity ease-in-out"
              style={{ opacity: fading ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
            >
              {placeholder}
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
          className="pop-in absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] min-w-[18rem] overflow-y-auto border border-gold/25 bg-navy-deep shadow-[0_24px_48px_-12px_rgba(0,0,0,0.7)] md:left-auto md:w-[24rem]"
          data-public-results
        >
          {query.trim() !== "" && (!data ? (
            <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
          ) : results.length === 0 ? (
            <div className="p-5 text-center" data-no-match>
              <p className="text-sm text-white">No match for &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-xs text-white/50">Try a compound name, or its CAS number.</p>
            </div>
          ) : (
            <ul role="listbox" aria-label="Matching compounds">
              {results.map((c, i) => (
                <li key={c.slug} role="option" aria-selected={i === activeIndex} onMouseEnter={() => setHighlight(i)}
                  className={`px-3 py-2.5 transition-colors ${i === activeIndex ? "bg-gold/10" : ""}`} data-public-result={c.slug}>
                  <Link href="/register" onClick={(e) => { e.preventDefault(); toRegister(); }} className="flex items-center gap-3">
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden border border-white/10 bg-white/[0.03]">
                      {c.imageUrl && <Image src={c.imageUrl} alt="" fill sizes="40px" className="object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-white">{c.name}</span>
                  </Link>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[3.25rem]">
                    {c.strengths.map((s) => (
                      <Link key={s.label} href="/register" onClick={(e) => { e.preventDefault(); toRegister(); }}
                        className="border border-white/15 px-2 py-0.5 text-[11px] text-white/80 transition-colors hover:border-gold hover:text-gold" data-public-strength>
                        {s.label} · <span className="text-gold"><Price price={s.price} /></span>
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ))}
          <button type="button" onClick={openList}
            className={`block w-full px-3 py-3 text-center text-xs uppercase tracking-[0.15em] text-white/70 transition-colors hover:text-gold ${query.trim() ? "border-t border-white/10" : ""}`}
            data-view-all>
            {viewAllLabel}
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

// The "View All" list: every compound on sale, alphabetical, with its strengths and prices. A compact sheet over the
// page; Escape or the close button closes it; choosing anything goes to /register.
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
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-navy-deep/70 px-4 py-6 sm:py-12" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-compound-list>
      <div role="dialog" aria-modal="true" aria-labelledby="compound-list-title" className="flex max-h-full w-full max-w-2xl flex-col border border-hairline bg-paper text-navy shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-4">
          <h2 id="compound-list-title" className="text-xs uppercase tracking-[0.25em] text-gold-ink">{title}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close the compound list" className="px-2 text-lg leading-none text-muted transition-colors hover:text-navy" data-close-list>×</button>
        </div>
        <ul className="divide-y divide-hairline overflow-y-auto px-5" data-compound-rows>
          {sorted.map((c) => (
            <li key={c.slug} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6" data-compound-row={c.slug}>
              <Link href="/register" onClick={(e) => { e.preventDefault(); onChoose(); }} className="text-sm text-navy hover:text-gold-ink">{c.name}</Link>
              <span className="flex flex-wrap gap-x-4 gap-y-1 sm:justify-end">
                {c.strengths.map((s) => (
                  <Link key={s.label} href="/register" onClick={(e) => { e.preventDefault(); onChoose(); }} className="whitespace-nowrap font-mono text-[12px] text-muted hover:text-gold-ink">
                    {s.label} <span className="text-navy"><Price price={s.price} /></span>
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

