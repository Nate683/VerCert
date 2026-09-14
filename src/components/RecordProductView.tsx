"use client";

import { useEffect } from "react";
import { recordView } from "@/lib/recently-viewed";
import { track } from "@/lib/track-client";

// Records the visit — for the recently-viewed strip, and as a product view on
// the customer's account. Renders nothing: it's a side effect the product page
// mounts, kept out of the page's server tree.
export function RecordProductView({ slug }: { slug: string }) {
  useEffect(() => {
    recordView(slug);
    track("product_view", { slug });
  }, [slug]);

  return null;
}
