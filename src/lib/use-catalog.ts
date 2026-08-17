"use client";

import { useEffect, useState } from "react";
import type { CatalogEntry } from "./catalog";

// One fetch per browser session, shared by every component that needs it —
// the header search box, the shop filters, the recently-viewed strip. The
// promise is memoised as well as the result so simultaneous mounts don't each
// fire their own request.
let cache: CatalogEntry[] | null = null;
let inflight: Promise<CatalogEntry[]> | null = null;

function loadCatalog(): Promise<CatalogEntry[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/catalog")
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then((data: { entries?: CatalogEntry[] }) => {
        cache = data.entries ?? [];
        return cache;
      })
      .catch(() => [] as CatalogEntry[])
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * @param enabled Defer the request until the data is actually needed — the
 * header search box only wants it once someone starts searching, and the
 * recently-viewed strip only once there is something to show. Nothing is
 * fetched on a page view that never uses it.
 */
export function useCatalog(enabled = true): { entries: CatalogEntry[]; loading: boolean } {
  const [entries, setEntries] = useState<CatalogEntry[]>(cache ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || cache) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flags the in-flight request; the fetch itself can only start after mount
    setLoading(true);
    loadCatalog().then((result) => {
      if (cancelled) return;
      setEntries(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { entries, loading };
}

/** Seeds the shared cache from server-rendered data, avoiding a second fetch. */
export function primeCatalog(entries: CatalogEntry[]) {
  if (!cache) cache = entries;
}
