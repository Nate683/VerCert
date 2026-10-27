"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { IDLE_WARNING_MS, STAFF_IDLE_TIMEOUT_MS, STAFF_SESSION_MAX_MS } from "@/lib/users/idle";

// Signs executives out after STAFF_IDLE_TIMEOUT_MS without activity, with a
// warning and countdown first, everywhere they're signed in (the terminals,
// /hq and exec-mode editing on the storefront). Customers and affiliates have
// no idle clock: their session simply runs 30 days from their last visit.
//
// The server enforces it too: the session itself expires unless
// /api/auth/keepalive extends it, and never later than STAFF_SESSION_MAX_MS
// after sign-in. The deadline is shared through localStorage, so working in
// one tab keeps the others signed in.

const DEADLINE_KEY = "vericert:idle-deadline";
// Activity extends the session at most this often.
const PING_INTERVAL_MS = 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"] as const;

function readDeadline(fallback: number | null): number | null {
  try {
    const stored = Number(localStorage.getItem(DEADLINE_KEY));
    return stored > 0 ? stored : fallback;
  } catch {
    return fallback;
  }
}

function writeDeadline(deadline: number) {
  try {
    localStorage.setItem(DEADLINE_KEY, String(deadline));
  } catch {
    // Private mode or blocked storage: this tab keeps its own clock.
  }
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function IdleTimeout() {
  const { user } = useAuth();
  if (!user?.role) return null;
  return <IdleClock />;
}

type EndReason = "idle" | "expired";

function IdleClock() {
  const [remaining, setRemaining] = useState<number>(STAFF_IDLE_TIMEOUT_MS);
  // The deadline is the 12-hour limit rather than inactivity, so staying
  // active can't extend it.
  const [atLimit, setAtLimit] = useState(false);
  const deadlineRef = useRef<number | null>(null);
  const limitRef = useRef<number | null>(null);
  const lastPingRef = useRef(0);
  const endingRef = useRef(false);
  const warningRef = useRef(false);
  const stayRef = useRef<HTMLButtonElement>(null);

  const signOut = useCallback(async (reason: EndReason) => {
    if (endingRef.current) return;
    endingRef.current = true;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // The session expires on its own; leaving the page is what matters.
    }
    // A full load, not router.push: it clears the dashboards' data out of memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/executive?reason=${reason}`);
  }, []);
  const reasonNow = useCallback(
    (): EndReason => (limitRef.current !== null && Date.now() >= limitRef.current - 1000 ? "expired" : "idle"),
    []
  );

  const extend = useCallback(
    async (force: boolean) => {
      const now = Date.now();
      if (!force && now - lastPingRef.current < PING_INTERVAL_MS) return;
      lastPingRef.current = now;
      try {
        const res = await fetch("/api/auth/keepalive", { method: "POST", cache: "no-store" });
        if (res.status === 401) {
          const data = (await res.json().catch(() => ({}))) as { limitReached?: boolean };
          await signOut(data.limitReached ? "expired" : "idle");
          return;
        }
        const data = (await res.json()) as { expiresAt?: number | null; limitAt?: number | null };
        const deadline = data.expiresAt ?? Date.now() + STAFF_IDLE_TIMEOUT_MS;
        deadlineRef.current = deadline;
        writeDeadline(deadline);
        if (data.limitAt) limitRef.current = data.limitAt;
        setAtLimit(limitRef.current !== null && deadline >= limitRef.current - 1000);
      } catch {
        // Offline for a moment: try again on the next activity.
        lastPingRef.current = 0;
      }
    },
    [signOut]
  );

  useEffect(() => {
    // Arriving on the page counts as activity. Start a fresh clock straight
    // away so a deadline left over from an earlier visit can't end this one
    // before the server answers.
    deadlineRef.current = Date.now() + STAFF_IDLE_TIMEOUT_MS;
    writeDeadline(deadlineRef.current);
    void extend(true);

    const onActivity = () => {
      // Once the warning is up, only "Stay signed in" keeps the session.
      if (!warningRef.current) void extend(false);
    };
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true, capture: true });
    }

    const tick = () => {
      const deadline = readDeadline(deadlineRef.current);
      if (deadline === null) return;
      deadlineRef.current = deadline;
      const left = deadline - Date.now();
      warningRef.current = left <= IDLE_WARNING_MS;
      setRemaining(left);
      if (left <= 0) void signOut(reasonNow());
    };
    const timer = window.setInterval(tick, 1000);
    // Timers are throttled in background tabs and stop while a laptop
    // sleeps; check straight away when the page is looked at again.
    document.addEventListener("visibilitychange", tick);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity, { capture: true });
      }
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [extend, signOut, reasonNow]);

  const warning = remaining <= IDLE_WARNING_MS;

  useEffect(() => {
    if (warning) stayRef.current?.focus();
  }, [warning]);

  if (!warning) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-timeout-title"
        aria-describedby="idle-timeout-body"
        className="w-full max-w-sm border border-gold bg-navy p-6 text-center text-white shadow-2xl"
      >
        <p className="text-xs uppercase tracking-[0.3em] text-gold">Session</p>
        <h2 id="idle-timeout-title" className="mt-2 font-serif text-2xl">
          {atLimit ? "Session ending" : "Still there?"}
        </h2>
        <p id="idle-timeout-body" className="mt-3 text-sm leading-relaxed text-white/80">
          {atLimit
            ? `For security, executive sessions end ${STAFF_SESSION_MAX_MS / 3600000} hours after signing in. Sign in again with your password and authenticator to continue.`
            : `For security you'll be signed out after ${STAFF_IDLE_TIMEOUT_MS / 60000} minutes without activity.`}
        </p>
        <p className="mt-4 font-mono text-3xl tabular-nums text-gold" aria-live="off">
          {formatCountdown(remaining)}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {!atLimit && (
          <button
            ref={stayRef}
            type="button"
            onClick={() => {
              warningRef.current = false;
              setRemaining(STAFF_IDLE_TIMEOUT_MS);
              void extend(true);
            }}
            className="min-h-11 flex-1 border border-gold bg-gold px-4 py-2.5 text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold"
          >
            Stay signed in
          </button>
          )}
          <button
            type="button"
            onClick={() => void signOut(atLimit ? "expired" : "idle")}
            className="min-h-11 flex-1 border border-white/30 px-4 py-2.5 text-xs uppercase tracking-[0.15em] text-white transition-colors hover:border-gold hover:text-gold"
          >
            {atLimit ? "Sign in again now" : "Sign out now"}
          </button>
        </div>
      </div>
    </div>
  );
}
