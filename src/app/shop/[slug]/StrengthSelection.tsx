"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PricedSize } from "@/lib/types";
import { ProductGallery } from "@/components/ProductGallery";
import { strengthImageSources, strengthKey, strengthUrlValue } from "@/lib/products/strengths";

// The strength selected on a product page (Stage 1), shared by the photo column and the purchase panel so both
// always show the same SKU: its vial image, price, bulk pricing, status, estimated date, purchase button and cart
// identifier change together, in one render. Choosing a strength rewrites ?strength= in place (history.replaceState,
// which Next's router follows) — no navigation, no reload, no new history entry.
//
// The initial strength is decided on the server from ?strength= (resolveStrength), so the first paint is already the
// right one; the provider is keyed on it by the page, so a navigation to another ?strength= starts fresh.

type Selection = { sizes: PricedSize[]; selected: PricedSize; select: (key: string) => void };

const StrengthContext = createContext<Selection | null>(null);

export function StrengthProvider({
  sizes,
  initialKey,
  children,
}: {
  sizes: PricedSize[];
  initialKey: string;
  children: ReactNode;
}) {
  const [key, setKey] = useState(initialKey);
  const selected = sizes.find((s) => strengthKey(s) === key) ?? sizes[0];
  const select = useCallback(
    (next: string) => {
      const size = sizes.find((s) => strengthKey(s) === next);
      if (!size) return;
      setKey(next);
      const url = new URL(window.location.href);
      url.searchParams.set("strength", strengthUrlValue(size, sizes));
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    },
    [sizes]
  );
  // B2 (Stage 2): if the link named a strength that isn't shown — deactivated, unknown, misspelt — or named the
  // shown one in another form (id, SKU, "10 MG"), rewrite ?strength= to the strength actually selected, once, in
  // place (replaceState: no navigation, no reload, no history entry, so it can't loop). Other parameters and the
  // hash are kept. A link without ?strength= is left as it is.
  useEffect(() => {
    const url = new URL(window.location.href);
    const requested = url.searchParams.get("strength");
    const initial = sizes.find((s) => strengthKey(s) === initialKey);
    if (requested === null || !initial) return;
    const canonical = strengthUrlValue(initial, sizes);
    if (requested === canonical) return;
    url.searchParams.set("strength", canonical);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    // Once per page: the server decided initialKey from this same URL.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({ sizes, selected, select }), [sizes, selected, select]);
  return <StrengthContext.Provider value={value}>{children}</StrengthContext.Provider>;
}

export function useStrength(): Selection {
  const ctx = useContext(StrengthContext);
  if (!ctx) throw new Error("useStrength must be used within a StrengthProvider");
  return ctx;
}

// The product gallery with the selected strength's vial image as the main photo, falling back to the product photo
// and then the placeholder (ProductGallery drops any source that fails). The shared gallery images are unchanged.
// Keyed on the main sources, so switching strength starts the main view on that strength's image.
export function StrengthGallery({
  name,
  productSources,
  galleryImageUrls,
}: {
  name: string;
  productSources: string[];
  galleryImageUrls?: string[];
}) {
  const { selected } = useStrength();
  const mainSources = strengthImageSources(selected, productSources);
  return (
    <div data-strength-image={strengthKey(selected)}>
      <ProductGallery
        key={mainSources.join("|")}
        name={name}
        alt={`${name}, ${selected.label}`}
        mainSources={mainSources}
        galleryImageUrls={galleryImageUrls}
      />
    </div>
  );
}
