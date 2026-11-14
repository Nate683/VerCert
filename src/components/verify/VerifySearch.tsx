"use client";

import Image from "next/image";
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import type { SearchResult, Suggestion } from "@/lib/coa/search";
import type { CertificateGroup } from "@/lib/coa/types";
import { CertificateResultsDialog } from "./CertificateResults";

// THE certificate search. One component, one endpoint (/api/verify/search), one results interface
// (CertificateResults) — used by the header's VERIFY BEFORE YOU BUY panel and by the Every Lot Certified search on
// /how-we-test. No sign-in. Type a product, strength, SKU, lot number or laboratory report number; suggestions appear
// as you type. Choosing a suggestion with published certificates — or pressing Enter — opens the results dialog:
// product — strength, its current lot and historical lots, each report with its two verification actions. Several
// matches are listed together; nothing is chosen arbitrarily. A catalog strength with no published certificate says so,
// neutrally. The endpoint returns published, non-test, non-deleted certificates only; catalog rows carry compound,
// strength and SKU only — no price, stock, product link or certificate data (lib/coa/public.ts).
//
// This is a separate component and data source from the header's product search (components/SearchBox.tsx), which
// searches the catalog only. Neither falls through to the other.

export type VerifySearchHandle = { focus: () => void };

const NO_CERTIFICATE = "No published certificate is currently available for this selection.";

// The empty state never says whether an unpublished, pending, synthetic or deleted record exists.
function noResults(query: string): string {
  const lotLike = /\d/.test(query) && /[a-z]/i.test(query) && query.replace(/[^a-z0-9]/gi, "").length >= 5 && !/\s\d+\s*mg$/i.test(query);
  return lotLike
    ? "No published certificate found for this lot number. Please verify the lot number printed on your vial. If the number is correct, contact VeriCert Peptides for assistance."
    : `No published certificate found for “${query}”. Please check the product name, strength or lot number. If it is correct, contact VeriCert Peptides for assistance.`;
}

// The full placeholder is cut off on a phone, so below sm (640px) a shorter one is used. A placeholder is an
// attribute, not styleable by CSS, so this reads the media query; the server render uses the full text.
const PLACEHOLDER = "Compound, strength, SKU or lot number — e.g. BPC-157 10mg";
const PLACEHOLDER_SHORT = "Compound, SKU or lot"; // fits a 320px phone (strength still matches; it's just not named)
const NARROW = "(max-width: 639px)";
function subscribeNarrow(onChange: () => void) {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);

const label = (s: { compoundName: string; sizeLabel: string | null }) => `${s.compoundName}${s.sizeLabel ? ` ${s.sizeLabel}` : ""}`;

function suggestionMeta(s: Suggestion): string | null {
  if (s.kind === "catalog") return s.sku ? `SKU ${s.sku}` : null;
  return s.lotNumbers.length === 1 ? `Lot ${s.lotNumbers[0]}` : s.lotNumbers.length > 1 ? `${s.lotNumbers.length} lots` : null;
}

export const VerifySearch = forwardRef<VerifySearchHandle, { autoFocus?: boolean; label?: string }>(function VerifySearch(
  { autoFocus = false, label: inputLabel = "Search certificates by compound, strength, SKU or lot number" },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ title: string; groups: CertificateGroup[] } | null>(null);
  const closeDialog = useCallback(() => setDialog(null), []);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const narrow = useNarrow();

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const term = q.trim();
  const searchable = term.replace(/[^a-z0-9]/gi, "").length >= 2;

  useEffect(() => {
    if (!searchable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results when the query is too short
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    // A chosen suggestion already has its certificates in the current result; don't search again for its label.
    if (selected && term === label(selected)) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/verify/search?q=${encodeURIComponent(term)}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 429 ? "Too many searches — wait a moment and try again." : "Search is unavailable right now.");
        setResult(await res.json());
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Search is unavailable right now.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term, searchable, selected]);

  const suggestions = result && suggestOpen && searchable ? result.suggestions : [];
  // The list opens only to show suggestions (or "Searching…" while the first answer is on its way). When nothing
  // matches it stays shut, and the one no-results message below says so — never two messages for the same thing.
  const dropdownOpen = suggestOpen && searchable && !error && (suggestions.length > 0 || loading);
  const total = result ? result.groups.length : 0;
  const activeId = active >= 0 && active < suggestions.length ? `${baseId}-opt-${active}` : undefined;

  function openAll() {
    if (!result || !result.groups.length) return;
    setDialog({
      title: result.groups.length === 1 ? label(result.groups[0]) : `${result.groups.length} matches for “${result.query}”`,
      groups: result.groups,
    });
  }

  function choose(s: Suggestion) {
    setSelected(s);
    setQ(label(s));
    setSuggestOpen(false);
    setActive(-1);
    if (s.kind === "certificate" && result) {
      const group = result.groups.find((g) => g.key === s.key);
      if (group) setDialog({ title: label(group), groups: [group] });
    } else {
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (dropdownOpen) {
        // Close the list only; don't let the header panel's Escape handler close the whole panel as well.
        e.preventDefault();
        e.stopPropagation();
        setSuggestOpen(false);
        setActive(-1);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!suggestOpen) setSuggestOpen(true);
      if (suggestions.length) setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length) setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && active < suggestions.length) choose(suggestions[active]);
      else {
        // Enter with nothing highlighted: every match for what was typed, listed together.
        setSuggestOpen(false);
        openAll();
      }
    }
  }

  return (
    <div className="font-sans">
      <div className="relative">
        {/* Inside the field, left to right: the navy-and-gold emblem (VeriCert-Emblem-Navy-Gold.svg, 24px tall at its
            own 30.01 × 30.52 proportions), the gray magnifying glass, then the text — which starts at 66px, clear of
            both. Identical in both entry points (header panel and Every Lot Certified). */}
        <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5" aria-hidden="true">
          <Image src="/VeriCert-Emblem-Navy-Gold.svg" alt="" width={300} height={305} unoptimized className="h-6 w-auto shrink-0" />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0 text-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSelected(null);
            setSuggestOpen(true);
            setActive(-1);
          }}
          onFocus={() => setSuggestOpen(true)}
          onBlur={() => setSuggestOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={narrow ? PLACEHOLDER_SHORT : PLACEHOLDER}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={dropdownOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label={inputLabel}
          className="w-full border border-control bg-paper py-3 pl-[66px] pr-4 font-sans text-base text-navy placeholder:text-muted focus:border-gold-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-gold-ink"
        />
      </div>

      {dropdownOpen && (
        <div className="mt-1 border border-hairline bg-paper shadow-[0_12px_28px_-16px_rgba(19,37,68,0.35)]">
          {suggestions.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Certificate suggestions">
              {suggestions.map((s, i) => {
                const meta = suggestionMeta(s);
                return (
                  <li
                    key={s.key}
                    id={`${baseId}-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep focus in the input so blur doesn't close the list first
                      choose(s);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex cursor-pointer flex-col gap-1 border-t border-hairline px-4 py-2.5 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
                      i === active ? "bg-surface" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-navy">{label(s)}</span>
                      {meta && <span className="block text-xs tabular-nums text-muted">{meta}</span>}
                    </span>
                    {s.kind === "certificate" ? (
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-ink">Published certificate</span>
                    ) : (
                      <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-muted">No published certificate</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p id={listId} role="status" className="px-4 py-3 text-sm text-muted">
              Searching…
            </p>
          )}
        </div>
      )}

      <div aria-live="polite" className="mt-4 text-sm">
        {error && <p className="text-[#8a3b33]">{error}</p>}

        {!error && selected?.kind === "catalog" && (
          <p className="text-muted">
            <span className="font-medium text-navy">{label(selected)}</span> — {NO_CERTIFICATE}
          </p>
        )}

        {!error && !selected && result && !loading && total === 0 && result.suggestions.length === 0 && (
          // The empty state, shown only when nothing at all matches. When there are suggestions (including "No published
          // certificate" catalog rows) they speak for themselves.
          <p className="text-muted">{noResults(result.query)}</p>
        )}

        {!error && selected?.kind !== "catalog" && result && !loading && total > 0 && (
          <button type="button" onClick={openAll} className="text-navy underline underline-offset-2 hover:text-gold-ink">
            {total === 1
              ? `View published certificates — ${label(result.groups[0])}`
              : `View ${total} matching products and strengths`}
          </button>
        )}
      </div>

      {dialog && <CertificateResultsDialog title={dialog.title} groups={dialog.groups} onClose={closeDialog} />}
    </div>
  );
});
