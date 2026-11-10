"use client";

import Image from "next/image";
import { useEffect } from "react";
import { VerifySearch } from "./VerifySearch";

// The site-wide VERIFY BEFORE YOU BUY control (components/Header.tsx). One clickable element — the gray-and-gold
// emblem with the words — that opens the certificate search inline beneath the header row. No page change, no
// modal, no sign-in. Escape or Close shuts it; navigating elsewhere closes it too (Header keys it to the route).

export const VERIFY_PANEL_ID = "verify-before-you-buy";

export function VerifyButton({ open, onToggle, compact = false }: { open: boolean; onToggle: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={VERIFY_PANEL_ID}
      className={`group flex min-h-11 items-center whitespace-nowrap text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
        compact ? "w-full justify-center gap-2.5 py-1.5" : ""
      }`}
    >
      {/* A thin, low-contrast gold frame (the brand gold at 45%, full gold on hover/open) around the gray-and-gold
          emblem (public/VeriCert-Emblem-Gray-Gold.svg, viewBox 303 × 309) and the words. */}
      <span
        className={`flex items-center gap-2.5 border px-3 py-1.5 transition-colors ${
          open ? "border-gold" : "border-gold/45 group-hover:border-gold"
        }`}
      >
        <Image src="/VeriCert-Emblem-Gray-Gold.svg" alt="" width={303} height={309} unoptimized className="h-8 w-auto shrink-0" />
        <span
          className={`text-[12px] uppercase tracking-[0.14em] transition-colors sm:text-[13px] ${
            open ? "text-gold" : "text-white/70 group-hover:text-gold"
          }`}
        >
          Verify Before You Buy
        </span>
      </span>
    </button>
  );
}

export function VerifyPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div id={VERIFY_PANEL_ID} role="region" aria-labelledby={`${VERIFY_PANEL_ID}-title`} className="border-t border-gold/20 bg-paper font-sans text-navy">
      {/* Scrolls inside itself, so long results never push past the viewport or sit over the page below. */}
      <div className="mx-auto max-h-[calc(100dvh-8rem)] max-w-7xl overflow-y-auto px-4 pb-6 pt-4 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <p id={`${VERIFY_PANEL_ID}-title`} className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-ink">
                Verify before you buy
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Find the published Certificate of Analysis for a compound, strength or lot.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 shrink-0 px-2 text-xs uppercase tracking-[0.14em] text-muted transition-colors hover:text-navy"
            >
              Close
            </button>
          </div>
          <VerifySearch autoFocus />
        </div>
      </div>
    </div>
  );
}
