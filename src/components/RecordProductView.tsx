"use client";

import { useEffect } from "react";
import { recordView } from "@/lib/recently-viewed";

// Records the visit for the recently-viewed strip. Renders nothing — it is a
// side effect the product page mounts, kept out of the page's server tree.
export function RecordProductView({ slug }: { slug: string }) {
  useEffect(() => {
    recordView(slug);
  }, [slug]);

  return null;
}
