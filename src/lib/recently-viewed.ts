"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "vericert-recently-viewed";
const MAX = 8;

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/** Records a visit, moving the slug to the front of the list. */
export function recordView(slug: string) {
  try {
    const next = [slug, ...read().filter((s) => s !== slug)].slice(0, MAX);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota — recently-viewed is a nicety, not a
    // feature worth throwing over.
  }
}

/**
 * Slugs the customer has looked at, most recent first. Returns an empty list
 * on the server and on the first client render so the markup matches, then
 * fills in after mount.
 */
export function useRecentlyViewed(excludeSlug?: string): string[] {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is unreadable on the server, so the list has to arrive after mount to keep hydration matching
    setSlugs(read().filter((s) => s !== excludeSlug));
  }, [excludeSlug]);

  return slugs;
}
