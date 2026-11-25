"use client";

import { useCatalogOverlay } from "@/components/CatalogOverlay";

// "Explore before you register" (Visual Package 3): opens the ONE shared catalog overlay over the registration page.
// Kept in its own component so it — not the registration form — is what talks to the overlay: opening and closing it
// never re-renders the form, and nothing here reads or touches the form's values.
// type="button": it sits beside the form, and must never be able to submit it (governance B).
export function ExploreInvitation() {
  const { openCatalog } = useCatalogOverlay();
  return (
    <div className="mt-8" data-explore-invitation>
      <h2 className="text-base font-semibold text-navy">Explore before you register</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">Discover our compounds, strengths and pricing. No account required.</p>
      <button
        type="button"
        onClick={(e) => openCatalog({ returnFocusTo: e.currentTarget })}
        className="mt-4 inline-flex min-h-11 items-center gap-2.5 border border-navy px-4 py-2.5 text-xs uppercase tracking-[0.18em] text-navy transition-colors hover:bg-navy/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        data-explore-button
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0 text-gold-ink" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        View Compounds &amp; Prices
        <span aria-hidden="true" className="text-navy/70">→</span>
      </button>
    </div>
  );
}
