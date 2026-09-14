"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { VeriCertLogo } from "./VeriCertLogo";
import { useAuth } from "@/lib/auth-context";
import { AGE_GATE_COOKIE } from "@/lib/age-gate";

// Session cookie — no Max-Age, so the browser drops it when the session ends.
// That is the brief exactly: quiet for the rest of this visit, asked again on
// a new one. Registration requires it too.
const COOKIE = AGE_GATE_COOKIE;

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): boolean {
  return document.cookie.split("; ").some((c) => c === `${COOKIE}=1`);
}

// Server renders as though the visitor has already acknowledged, so the gate
// is never in the HTML: the cookie is unreadable there, and guessing wrong
// would either flash the modal at someone who dismissed it or mismatch on
// hydration. The client's first snapshot supplies the real answer.
function getServerSnapshot(): boolean {
  return true;
}

function acknowledge() {
  document.cookie = `${COOKIE}=1; path=/; SameSite=Lax`;
  listeners.forEach((l) => l());
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AgeGate() {
  const { user, loading } = useAuth();
  const acknowledged = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const panelRef = useRef<HTMLDivElement>(null);

  // Derived during render rather than pushed into state from an effect, so
  // there is no frame where the gate is up for someone who should not see it.
  // `loading` holds it back until the session is known — otherwise a signed-in
  // visitor gets a flash of the modal on every cold load.
  const open = !loading && !user && !acknowledged;

  // Nothing behind the gate should scroll while it is up.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Move focus into the dialog on open, and put it back on the way out.
  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => restoreTo?.focus?.();
  }, [open]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    // No Escape handler on purpose: this is a gate, not a dismissible dialog.
    // The only ways out are the two buttons.
    if (event.key !== "Tab") return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-navy/95 px-5 py-10 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-gate-heading"
        aria-describedby="age-gate-body"
        className="max-h-full w-full max-w-lg overflow-y-auto border border-hairline bg-paper px-7 py-10 text-center shadow-2xl sm:px-10"
      >
        <VeriCertLogo className="mx-auto h-11 aspect-[441/194]" tone="ink" />

        <p className="mt-7 text-xs uppercase tracking-[0.35em] text-gold-ink">
          Research Use Only
        </p>

        <h2
          id="age-gate-heading"
          className="mt-4 font-serif text-2xl leading-snug text-navy sm:text-3xl"
        >
          You must be 21 or older to enter
        </h2>

        <div className="mx-auto mt-5 h-px w-16 bg-gold-ink/50" />

        <p id="age-gate-body" className="mt-6 text-sm leading-relaxed text-muted">
          VeriCert supplies research compounds strictly for in-vitro laboratory
          use by qualified professionals. Nothing sold here is intended for human
          or veterinary consumption. By entering you confirm you are at least 21
          and accept our{" "}
          <Link href="/terms" className="text-gold-ink underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-gold-ink underline underline-offset-2">
            RUO Agreement
          </Link>
          .
        </p>

        <div className="mt-9 flex flex-col gap-3">
          <button
            type="button"
            onClick={acknowledge}
            className="w-full border border-gold bg-gold px-6 py-3 text-sm uppercase tracking-[0.18em] text-black transition-colors hover:border-gold-ink hover:bg-transparent hover:text-gold-ink"
          >
            I am 21 or older — Enter
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "https://www.google.com";
            }}
            className="w-full border border-navy/25 px-6 py-3 text-sm uppercase tracking-[0.18em] text-navy transition-colors hover:border-gold-ink hover:text-gold-ink"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}
