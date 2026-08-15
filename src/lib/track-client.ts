"use client";

import type { AnalyticsEventType } from "@/lib/types";

const SESSION_KEY = "vericert-session-id";

function getSessionId(): string {
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

// Fire-and-forget funnel event ping — never throws, never blocks the caller.
export function track(event: AnalyticsEventType, metadata?: Record<string, unknown>): void {
  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, sessionId: getSessionId(), metadata }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // ignore — analytics must never break the storefront
  }
}
