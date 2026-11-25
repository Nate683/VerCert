"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { matchPublicCompounds, usd, type PublicCompound } from "@/lib/catalog-public";
import { usePublicCatalog } from "@/lib/use-public-catalog";

// THE "View All Compounds & Prices" overlay (Visual Package 3): one implementation, opened from every entry point —
// the desktop and mobile header searches and the registration page's "VIEW COMPOUNDS & PRICES" button.
//
// Mounting (governance A1): the provider wraps the header AND the page (SiteChrome), and the dialog is portaled to
// document.body. Opening or closing changes only this provider's state: no route change, nothing above or around the
// page re-renders or remounts, so a half-completed registration form keeps every value. The overlay never reads,
// stores or sends anything from the page; it only reads the public catalog.
//
// Choosing a compound, a strength or CREATE YOUR FREE ACCOUNT:
//  - on /register: closes the overlay and returns the visitor to the form (no navigation, no reload);
//  - anywhere else: goes to /register, as before.
// Every control here is type="button" (governance B), and the dialog sits outside any form in the DOM, so nothing in
// it can submit a form — not even Enter in its search field.

type OpenOptions = { returnFocusTo?: HTMLElement | null };
const CatalogOverlayContext = createContext<{ openCatalog: (opts?: OpenOptions) => void } | null>(null);

export function useCatalogOverlay() {
  const ctx = useContext(CatalogOverlayContext);
  if (!ctx) throw new Error("useCatalogOverlay must be used inside CatalogOverlayProvider");
  return ctx;
}

// The registration form's heading (RegisterClient) — where a registration action from the overlay returns the visitor.
export const REGISTER_FORM_HEADING_ID = "register-form-heading";

export function CatalogOverlayProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const savedScroll = useRef(0);
  const pathname = usePathname();
  const router = useRouter();
  const data = usePublicCatalog(open);

  const openCatalog = useCallback((opts?: OpenOptions) => {
    returnFocus.current = opts?.returnFocusTo ?? (document.activeElement as HTMLElement | null);
    savedScroll.current = window.scrollY;
    setOpen(true);
  }, []);
  const ctx = useMemo(() => ({ openCatalog }), [openCatalog]);

  // Normal dismissal (×, Escape, backdrop): focus back to the control that opened it, page position unchanged.
  const dismiss = useCallback(() => {
    setOpen(false);
    const target = returnFocus.current;
    requestAnimationFrame(() => {
      if (Math.abs(window.scrollY - savedScroll.current) > 1) window.scrollTo(0, savedScroll.current);
      if (target?.isConnected) target.focus({ preventScroll: true });
    });
  }, []);

  // A registration action (a compound, a strength, CREATE YOUR FREE ACCOUNT).
  const toRegistration = useCallback(() => {
    setOpen(false);
    if (pathname === "/register") {
      requestAnimationFrame(() => {
        const heading = document.getElementById(REGISTER_FORM_HEADING_ID);
        heading?.scrollIntoView({ block: "start" });
        heading?.focus({ preventScroll: true });
      });
    } else {
      router.push("/register");
    }
  }, [pathname, router]);

  return (
    <CatalogOverlayContext.Provider value={ctx}>
      {children}
      {open && data && createPortal(<CompoundList compounds={data.compounds} onClose={dismiss} onChoose={toRegistration} />, document.body)}
    </CatalogOverlayContext.Provider>
  );
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

// The sheet. Search state lives HERE, so closing (which unmounts it) clears it: reopening shows the full catalog.
// On white, names and strengths use --muted (5.02:1) and prices --gold-ink (5.31:1, semibold), as approved in Package 2.
function CompoundList({ compounds, onClose, onChoose }: { compounds: PublicCompound[]; onClose: () => void; onChoose: () => void }) {
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the close button, not the search field: opening never raises a phone keyboard by itself.
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      // Keep Tab inside the dialog.
      const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input")].filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  const alphabetical = useMemo(() => [...compounds].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })), [compounds]);
  // The same matching as the header search, over the COMPLETE eligible list (no result limit), shown alphabetically.
  const shown = useMemo(() => {
    if (!query.trim()) return alphabetical;
    const hits = new Set(matchPublicCompounds(compounds, query).map((c) => c.slug));
    return alphabetical.filter((c) => hits.has(c.slug));
  }, [alphabetical, compounds, query]);

  const choose = (e: React.MouseEvent) => { e.preventDefault(); onChoose(); };
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-navy-deep/70 px-4 py-6 sm:items-center sm:py-12 [@media(max-height:560px)]:py-2"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} data-compound-list>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="compound-list-title"
        className="flex max-h-full w-full max-w-2xl flex-col border border-navy bg-paper shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-center justify-between gap-4 bg-navy px-5 py-3" data-list-header>
          <h2 id="compound-list-title" className="text-xs uppercase tracking-[0.22em] text-gold">View All Compounds &amp; Prices</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close the compound list"
            className="-mr-3 flex h-11 w-11 items-center justify-center text-lg leading-none text-white/70 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-gold" data-close-list>×</button>
        </div>

        <div className="shrink-0 border-b border-hairline px-5 py-3" data-list-search>
          <label htmlFor="compound-list-search" className="sr-only">Search compounds by name, alternate name or CAS number</label>
          <div className="flex items-center gap-2 border border-hairline bg-paper px-3 focus-within:border-navy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0 text-gold-ink" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              id="compound-list-search"
              ref={inputRef}
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              placeholder="Search compounds..."
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[16px] text-navy placeholder:text-muted focus:outline-none sm:text-sm"
              data-list-search-input
            />
            {query && (
              <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear the search"
                className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center text-muted transition-colors hover:text-navy" data-list-search-clear>×</button>
            )}
          </div>
        </div>

        {shown.length > 0 ? (
        <ul className="min-h-[6rem] flex-1 divide-y divide-hairline overflow-y-auto overscroll-contain px-5" data-compound-rows>
          {shown.map((c) => (
            <li key={c.slug} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6" data-compound-row={c.slug}>
              <Link href="/register" onClick={choose} className="text-sm font-medium text-muted transition-colors hover:text-navy" data-list-name>{c.name}</Link>
              <span className="flex flex-wrap gap-x-4 gap-y-1 sm:justify-end">
                {c.strengths.map((s) => (
                  <Link key={s.label} href="/register" onClick={choose} className="whitespace-nowrap py-0.5 text-[12px] text-muted transition-colors hover:text-navy" data-list-strength>
                    {s.label} <span className="ml-1 font-semibold text-gold-ink" data-list-price><Price price={s.price} /></span>
                  </Link>
                ))}
              </span>
            </li>
          ))}
        </ul>
        ) : (
          <p role="status" className="min-h-[6rem] flex-1 px-5 py-6 text-center text-sm text-muted" data-list-empty>No matching compounds found.</p>
        )}

        <div className="flex shrink-0 flex-col gap-3 border-t border-hairline bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 [@media(max-height:560px)]:py-2" data-list-register>
          {/* Very short viewports (a phone with its keyboard open) keep the button and drop the explanation, so the list
              stays usable. */}
          <p className="text-xs leading-relaxed text-muted [@media(max-height:560px)]:hidden" data-list-register-text>
            Compound names, strengths and public prices can be viewed without an account. Registration is required for
            full product details, inventory availability and purchasing.
          </p>
          <Link href="/register" onClick={choose}
            className="shrink-0 border border-gold bg-gold px-5 py-2.5 text-center text-xs uppercase tracking-[0.18em] text-black transition-colors hover:border-gold-ink hover:bg-transparent hover:text-gold-ink" data-list-cta>
            Create Your Free Account
          </Link>
        </div>
      </div>
    </div>
  );
}
