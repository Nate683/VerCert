"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { searchCatalog } from "@/lib/catalog";
import { useCatalog } from "@/lib/use-catalog";

// Instant search across product name and CAS number. The catalog is small
// enough to hold in memory, so results appear as the customer types — there
// is no request per keystroke and therefore no lag.
export function SearchBox({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  // The catalog is only fetched once someone actually engages with search, so
  // a page view that never touches the box costs nothing.
  const [engaged, setEngaged] = useState(false);
  const { entries, loading } = useCatalog(engaged);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchCatalog(entries, query), [entries, query]);
  // The result list shrinks as the query narrows, so clamp rather than reset
  // in an effect — the highlight can never point past the end.
  const activeIndex = Math.min(highlight, Math.max(0, results.length - 1));

  // Close on an outside click or Escape; open with the forward-slash shortcut
  // the way a catalog tool should.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
      const target = event.target as HTMLElement | null;
      const typingElsewhere =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (event.key === "/" && !typingElsewhere) {
        event.preventDefault();
        setEngaged(true);
        inputRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    onNavigate?.();
    router.push(href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (event.key === "Enter" && query.trim()) {
        event.preventDefault();
        go(`/shop?q=${encodeURIComponent(query.trim())}`);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((activeIndex + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((activeIndex - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(`/shop/${results[activeIndex].slug}`);
    }
  }

  const showPanel = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <label htmlFor="catalog-search" className="sr-only">
        Search the catalog by name or CAS number
      </label>
      <div className="flex items-center gap-2 border border-white/15 bg-black/30 px-3 transition-colors focus-within:border-gold">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-white/40" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          id="catalog-search"
          ref={inputRef}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => {
            setEngaged(true);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search name or CAS number"
          aria-expanded={showPanel}
          aria-controls="catalog-search-results"
          role="combobox"
          aria-autocomplete="list"
          className="w-full bg-transparent py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="shrink-0 text-white/40 transition-colors hover:text-gold"
          >
            ×
          </button>
        )}
      </div>

      {showPanel && (
        <div
          id="catalog-search-results"
          role="listbox"
          className="pop-in absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto border border-gold/25 bg-navy-deep shadow-[0_24px_48px_-12px_rgba(0,0,0,0.7)]"
        >
          {loading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className="p-5 text-center">
              <p className="text-sm text-white">No match for &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-xs text-white/50">
                Try a compound name, or the CAS number from your label.
              </p>
            </div>
          ) : (
            <>
              <ul>
                {results.map((entry, i) => (
                  <li key={entry.slug}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === activeIndex}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => go(`/shop/${entry.slug}`)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        i === activeIndex ? "bg-gold/10" : ""
                      }`}
                    >
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden border border-white/10 bg-white/[0.03]">
                        {entry.imageUrl && (
                          <Image src={entry.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">{entry.name}</span>
                        <span className="block truncate font-mono text-[11px] text-white/40">
                          CAS {entry.casNumber} · {entry.purityPercent.toFixed(1)}%
                        </span>
                      </span>
                      <span className="shrink-0 text-sm text-gold">${entry.minPriceUsd}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => go(`/shop?q=${encodeURIComponent(query.trim())}`)}
                className="block w-full border-t border-white/10 px-3 py-2.5 text-center text-xs uppercase tracking-[0.15em] text-white/60 transition-colors hover:text-gold"
              >
                See all results →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
