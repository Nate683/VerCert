"use client";

import Link from "next/link";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { SearchResult } from "@/lib/coa/search";
import { LOT_AVAILABILITY_LABELS, type PublicCertificate } from "@/lib/coa/types";
import { CertificateActions } from "./CertificateActions";

// THE certificate search. One component, one endpoint (/api/verify/search), one set of records and actions —
// used by the header's VERIFY BEFORE YOU BUY panel and by the Every Lot Certified search on /how-we-test.
// No sign-in. Type a compound, SKU, strength or lot number; suggestions appear as you type; each result has its
// certificate actions, so it's two or three steps from opening search to the open COA.

export type VerifySearchHandle = { focus: () => void };

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function Result({ cert }: { cert: PublicCertificate }) {
  return (
    <li className="border-t border-hairline py-4 first:border-t-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="min-w-0">
          <p className="font-serif text-lg text-navy">
            {cert.compoundName}
            {cert.sizeLabel && <span className="text-muted"> · {cert.sizeLabel}</span>}
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Lot</dt>
            <dd className="font-mono text-navy">
              <Link href={`/lot/${encodeURIComponent(cert.lotNumber)}`} className="underline-offset-2 hover:underline">
                {cert.lotNumber}
              </Link>
            </dd>
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

export const VerifySearch = forwardRef<VerifySearchHandle, { autoFocus?: boolean; label?: string }>(function VerifySearch(
  { autoFocus = false, label = "Search certificates by compound, SKU, strength or lot number" },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const term = q.trim();
    if (term.replace(/[^a-z0-9]/gi, "").length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results when the query is too short
      setResult(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
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
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q]);

  const suggestions = result && suggestOpen ? result.suggestions.filter((s) => s.toLowerCase() !== q.trim().toLowerCase()) : [];
  const total = result ? result.exact.length + result.current.length + result.recent.length : 0;

  function choose(s: string) {
    setQ(s);
    setSuggestOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  }

  return (
    <div>
      <label className="block">
        <span className="sr-only">{label}</span>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSuggestOpen(true);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (!suggestions.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
            else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(suggestions[active]); }
            else if (e.key === "Escape") setSuggestOpen(false);
          }}
          placeholder="Compound, SKU or lot number — e.g. BPC-157 10mg"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={label}
          className="w-full border border-navy/30 bg-paper px-4 py-3 text-base text-navy placeholder:text-muted focus:border-navy focus:outline-none"
        />
      </label>

      {suggestions.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Suggestions" className="mt-1 border border-hairline bg-paper">
          {suggestions.map((s, i) => (
            <li
              key={s}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); choose(s); }}
              className={`cursor-pointer px-4 py-2 text-sm ${i === active ? "bg-surface text-navy" : "text-navy/80 hover:bg-surface"}`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}

      <div aria-live="polite" className="mt-4">
        {loading && !result && <p className="text-sm text-muted">Searching…</p>}
        {error && <p className="text-sm text-[#8a3b33]">{error}</p>}
        {result && !error && total === 0 && (
          <p className="text-sm text-muted">
            No published certificate matches &ldquo;{result.query}&rdquo;. For an older lot, enter its full lot number from the vial label.
          </p>
        )}
        {result && !error && total > 0 && (
          <div className="space-y-6">
            {result.exact.length > 0 && (
              <section>
                <h3 className="text-xs uppercase tracking-[0.18em] text-gold-ink">Lot {result.exact[0].lotNumber}</h3>
                <ul className="mt-2">{result.exact.map((c) => <Result key={c.id} cert={c} />)}</ul>
              </section>
            )}
            {result.current.length > 0 && (
              <section>
                <h3 className="text-xs uppercase tracking-[0.18em] text-gold-ink">Currently available lots</h3>
                <ul className="mt-2">{result.current.map((c) => <Result key={c.id} cert={c} />)}</ul>
              </section>
            )}
            {result.recent.length > 0 && (
              <section>
                {showRecent ? (
                  <>
                    <h3 className="text-xs uppercase tracking-[0.18em] text-gold-ink">Earlier lots — last 12 months</h3>
                    <ul className="mt-2">{result.recent.map((c) => <Result key={c.id} cert={c} />)}</ul>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowRecent(true)}
                    className="text-sm text-navy underline underline-offset-2 hover:text-gold-ink"
                  >
                    Show {result.recent.length} earlier lot{result.recent.length === 1 ? "" : "s"} from the last 12 months
                  </button>
                )}
              </section>
            )}
            <p className="text-xs text-muted">Older certificates remain available by their exact lot number.</p>
          </div>
        )}
      </div>
    </div>
  );
});
