"use client";

import { useEffect, useState } from "react";
import type { PublicCompound } from "./catalog-public";

// The ONE public compound list in the browser (Visual Package 3): every header search instance and the shared catalog
// overlay read it from here — one request per page load (/api/public-catalog), shared by all of them.
export type PublicCatalog = { count: number; compounds: PublicCompound[] };

let cache: PublicCatalog | null = null;
let inflight: Promise<PublicCatalog> | null = null;

export function loadPublicCatalog(): Promise<PublicCatalog> {
  if (cache) return Promise.resolve(cache);
  inflight ??= fetch("/api/public-catalog")
    .then((r) => (r.ok ? r.json() : { count: 0, compounds: [] }))
    .then((d) => (cache = { count: d.count ?? 0, compounds: d.compounds ?? [] }))
    .catch(() => ({ count: 0, compounds: [] }))
    .finally(() => { inflight = null; });
  return inflight;
}

/** @param enabled Defer the request until it's needed (the overlay only loads once opened). */
export function usePublicCatalog(enabled = true): PublicCatalog | null {
  const [data, setData] = useState<PublicCatalog | null>(cache);
  useEffect(() => {
    if (!enabled || cache) return;
    let cancelled = false;
    loadPublicCatalog().then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [enabled]);
  return data ?? cache;
}
