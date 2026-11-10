"use client";

import Link from "next/link";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import type { SearchResult, Suggestion } from "@/lib/coa/search";
import { LOT_AVAILABILITY_LABELS, type PublicCertificate } from "@/lib/coa/types";
import { CertificateActions } from "./CertificateActions";

// THE certificate search. One component, one endpoint (/api/verify/search), one set of records and actions —
// used by the header's VERIFY BEFORE YOU BUY panel and by the Every Lot Certified search on /how-we-test.
// No sign-in. Type a compound, SKU, strength or lot number; suggestions appear as you type. A suggestion either
// has published certificates behind it (choosing it shows them, each with its certificate actions) or is a catalog
// strength with no published certificate (choosing it says so, neutrally). The endpoint returns approved,
// published, non-test certificates only; catalog rows come only for a signed-in visitor (the catalog is gated).
//
// This is a separate component and data source from the header's product search (components/SearchBox.tsx), which
// searches the catalog only. Neither falls through to the other.

export type VerifySearchHandle = { focus: () => void };

const NO_CERTIFICATE = "No published certificate is currently available for this selection.";

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

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

const label = (s: { compoundName: string; sizeLabel: string | null }) => `${s.compoundName}${s.sizeLabel ? ` ${s.sizeLabel}` : ""}`;

function suggestionMeta(s: Suggestion): string | null {
  if (s.kind !== "certificate") return null;
  const lots = s.lotNumbers.length === 1 ? `Lot ${s.lotNumbers[0]}` : s.lotNumbers.length > 1 ? `${s.lotNumbers.length} lots` : null;
  const sku = s.skus.length === 1 ? `SKU ${s.skus[0]}` : null;
  return [lots, sku].filter(Boolean).join(" · ") || null;
}

function Result({ cert }: { cert: PublicCertificate }) {
  return (
    <li className="border-t border-hairline py-5 first:border-t-0 first:pt-3">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="min-w-0">
          <p className="text-base font-semibold text-navy">
            {cert.compoundName}
            {cert.sizeLabel && <span className="font-normal text-muted"> · {cert.sizeLabel}</span>}
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-sm leading-relaxed">
            <dt className="text-muted">Lot</dt>
            <dd className="tabular-nums text-navy">
              <Link href={`/lot/${encodeURIComponent(cert.lotNumber)}`} className="underline underline-offset-2 hover:text-gold-ink">
                {cert.lotNumber}
              </Link>
            </dd>
            {cert.sku && (
              <>
                <dt className="text-muted">SKU</dt>
                <dd className="text-navy">{cert.sku}</dd>
              </>
            )}
            <dt className="text-muted">Laboratory</dt>
            <dd className="text-navy">{cert.laboratoryName ?? "—"}</dd>
            <dt className="text-muted">Issued</dt>
            <dd className="text-navy">{formatDate(cert.issuedOn)}</dd>
            <dt className="text-muted">Status</dt>
            <dd className="text-navy">{LOT_AVAILABILITY_LABELS[cert.availability]}</dd>
          </dl>
        </div>
        <div className="w-full md:max-w-sm md:shrink-0">
          <CertificateActions cert={cert} />
        </div>
      </div>
    </li>
  );
}

function Group({ title, certs }: { title: string; certs: PublicCertificate[] }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-ink">{title}</h3>
      <ul className="mt-1">{certs.map((c) => <Result key={c.id} cert={c} />)}</ul>
    </section>
  );
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
  const [showRecent, setShowRecent] = useState(false);
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
        setShowRecent(false);
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
  const dropdownOpen = suggestOpen && searchable && !error && (loading || result !== null);
  const total = result ? result.exact.length + result.current.length + result.recent.length : 0;
  const activeId = active >= 0 && active < suggestions.length ? `${baseId}-opt-${active}` : undefined;

  function choose(s: Suggestion) {
    setSelected(s);
    setQ(label(s));
    setSuggestOpen(false);
    setActive(-1);
    inputRef.current?.focus();
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
      else setSuggestOpen(false); // Enter with nothing highlighted shows the full results for what was typed.
    }
  }

  // The certificates behind a chosen certificate suggestion, from the same response that offered it.
  const all = result ? [...result.exact, ...result.current, ...result.recent] : [];
  const chosenCerts =
    selected?.kind === "certificate" ? selected.certificateIds.map((id) => all.find((c) => c.id === id)).filter((c): c is PublicCertificate => Boolean(c)) : [];

  return (
    <div className="font-sans">
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
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
          className="w-full border border-control bg-paper py-3 pl-11 pr-4 font-sans text-base text-navy placeholder:text-muted focus:border-gold-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-gold-ink"
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
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-ink">
                        Published certificate{s.certificateIds.length > 1 ? `s · ${s.certificateIds.length}` : ""}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-muted">No published certificate</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p id={listId} role="status" className="px-4 py-3 text-sm text-muted">
              {loading ? "Searching…" : "No suggestions for this search."}
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

        {!error && selected?.kind === "certificate" && chosenCerts.length > 0 && (
          <Group
            title={`${label(selected)} — ${chosenCerts.length} published certificate${chosenCerts.length === 1 ? "" : "s"}`}
            certs={chosenCerts}
          />
        )}

        {!error && !selected && result && !loading && total === 0 && (
          // Honest empty state: nothing has been published for this search. Not an error, and no hint that a
          // certificate should have turned up.
          <p className="text-muted">
            No published certificate matches &ldquo;{result.query}&rdquo;. Certificates are published as each lot is released.
          </p>
        )}

        {!error && !selected && result && total > 0 && (
          <div className="space-y-6">
            {result.exact.length > 0 && <Group title={`Lot ${result.exact[0].lotNumber}`} certs={result.exact} />}
            {result.current.length > 0 && <Group title="Currently available lots" certs={result.current} />}
            {result.recent.length > 0 &&
              (showRecent ? (
                <Group title="Earlier lots — last 12 months" certs={result.recent} />
              ) : (
                <button type="button" onClick={() => setShowRecent(true)} className="text-navy underline underline-offset-2 hover:text-gold-ink">
                  Show {result.recent.length} earlier lot{result.recent.length === 1 ? "" : "s"} from the last 12 months
                </button>
              ))}
            <p className="text-xs text-muted">Older certificates remain available by their exact lot number.</p>
          </div>
        )}
      </div>
    </div>
  );
});
