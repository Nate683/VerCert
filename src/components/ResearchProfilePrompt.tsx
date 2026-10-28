"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { RESEARCH_CATEGORIES, normalizePhone } from "@/lib/users/registration";
import { AcknowledgmentText } from "./AcknowledgmentText";

// One-time prompt for customer accounts made before registration asked for a
// research category, phone and the acknowledgment. Shows on the next signed-in
// visit, asks only for what's missing, and goes away for good once answered
// or skipped (the server decides who sees it: lib/users/research-profile.ts).
// Nothing else on the site waits on it.

// The legal pages stay readable, as with the age gate: the acknowledgment
// links to two of them.
const UNPROMPTED = new Set([
  "/terms",
  "/privacy-policy",
  "/refund-policy",
  "/shipping-policy",
  "/dashboard-policy",
  "/two-factor",
]);

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ResearchProfilePrompt() {
  const { user, refresh } = useAuth();
  const pathname = usePathname();
  const gaps = user?.researchProfileGaps ?? null;
  const [researchCategory, setResearchCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const open = Boolean(gaps) && !closed && !UNPROMPTED.has(pathname);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => restoreTo?.focus?.();
  }, [open]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
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

  async function send(body: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/research-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      // 409: already resolved elsewhere (another tab) — nothing left to ask.
      if (!res.ok && res.status !== 409) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setClosed(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (gaps?.phone && !normalizePhone(phone)) {
      setError("Enter a valid phone number, e.g. (555) 123-4567, or +44 20 7946 0958 outside the US.");
      return;
    }
    await send({
      ...(gaps?.category ? { researchCategory } : {}),
      ...(gaps?.phone ? { phone } : {}),
      ...(gaps?.acknowledgment ? { acknowledgment: acknowledged } : {}),
    });
  }

  if (!open || !gaps) return null;

  return (
    <div
      className="fixed inset-0 z-[190] overflow-y-auto bg-navy/80 px-5 py-10 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="research-profile-heading"
          className="w-full max-w-md border border-hairline bg-surface p-5 shadow-2xl sm:p-8"
        >
          <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Research Account</p>
          <h2 id="research-profile-heading" className="mt-3 font-serif text-2xl text-navy">
            Complete your account
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            We now ask every research account for these details. It takes a moment, and we&apos;ll only ask once.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {gaps.category && (
              <div>
                <label htmlFor="profile-research-category" className="mb-1.5 block text-xs text-muted">
                  Researcher / Business Type*
                </label>
                <select
                  id="profile-research-category"
                  required
                  value={researchCategory}
                  onChange={(e) => setResearchCategory(e.target.value)}
                  className={`input-field-light ${researchCategory ? "" : "text-muted/70"}`}
                >
                  <option value="" disabled>
                    Select your research category
                  </option>
                  {RESEARCH_CATEGORIES.map((category) => (
                    <option key={category} value={category} className="text-navy">
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {gaps.phone && (
              <input
                id="profile-phone"
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                aria-label="Phone number"
                autoComplete="tel"
                inputMode="tel"
                maxLength={30}
                className="input-field-light"
              />
            )}
            {gaps.acknowledgment && (
              <label className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-muted">
                <input
                  id="profile-acknowledgment"
                  type="checkbox"
                  required
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
                />
                <span>
                  <AcknowledgmentText />
                </span>
              </label>
            )}
            {error && (
              <div role="alert" className="border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full border border-gold bg-gold py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold-ink disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => send({ skip: true })}
              className="w-full py-2 text-xs uppercase tracking-[0.2em] text-muted transition-colors hover:text-gold-ink disabled:opacity-40"
            >
              Not now
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
