"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProductCard } from "@/components/ProductCard";
import { useExecMode } from "@/lib/exec-mode-context";
import type { Product } from "@/lib/types";

// Renders the homepage's featured product grid. In exec mode, tiles become
// drag-reorderable; dropping saves the new explicit order to
// featured_products.slugs (auto-selection is "pinned" into an explicit list
// the first time an admin reorders).
export function HomeFeaturedGrid({ products }: { products: Product[] }) {
  const { execMode, beginSave, endSave } = useExecMode();
  const router = useRouter();
  const [order, setOrder] = useState(products.map((p) => p.slug));
  const [dragSlug, setDragSlug] = useState<string | null>(null);

  const ordered = order.map((slug) => products.find((p) => p.slug === slug)).filter((p): p is Product => Boolean(p));

  async function persistOrder(newOrder: string[]) {
    beginSave();
    try {
      const res = await fetch("/api/executive/inline-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "featured_products", patch: { slugs: newOrder } }),
      });
      if (!res.ok) throw new Error("Failed to save.");
      endSave(true);
      router.refresh();
    } catch {
      endSave(false);
    }
  }

  function handleDrop(targetSlug: string) {
    if (!dragSlug || dragSlug === targetSlug) return;
    const next = [...order];
    const fromIndex = next.indexOf(dragSlug);
    const toIndex = next.indexOf(targetSlug);
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, dragSlug);
    setOrder(next);
    setDragSlug(null);
    persistOrder(next);
  }

  return (
    <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {ordered.map((product) =>
        execMode ? (
          <div
            key={product.slug}
            draggable
            onDragStart={() => setDragSlug(product.slug)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(product.slug)}
            className="cursor-move outline-dashed outline-1 outline-transparent transition-colors hover:outline-gold/60"
          >
            <ProductCard product={product} />
          </div>
        ) : (
          <ProductCard key={product.slug} product={product} />
        )
      )}
    </div>
  );
}
