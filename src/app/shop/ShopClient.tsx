"use client";

import { useMemo, useState } from "react";
import { CATEGORIES } from "@/lib/products";
import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/ProductCard";

export function ShopClient({ products }: { products: Product[] }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory = category === "All" || p.category === category;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        q.length === 0 ||
        p.name.toLowerCase().includes(q) ||
        p.casNumber.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [products, category, query]);

  return (
    <div>
      <div className="flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`border px-4 py-2 text-xs uppercase tracking-[0.15em] transition-colors ${
                category === c
                  ? "border-gold bg-gold text-black"
                  : "border-white/15 text-white/60 hover:border-gold hover:text-gold"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or CAS number..."
          className="w-full border border-white/15 bg-transparent px-4 py-2 text-sm text-white placeholder:text-white/30 focus:border-gold focus:outline-none sm:w-72"
        />
      </div>

      <p className="mt-6 text-xs uppercase tracking-[0.2em] text-white/40">
        {filtered.length} {filtered.length === 1 ? "compound" : "compounds"}
      </p>

      {filtered.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      ) : (
        <div className="mt-24 flex flex-col items-center text-center">
          <p className="font-serif text-2xl text-white">No compounds found</p>
          <p className="mt-2 text-sm text-white/50">
            Try a different search term or category.
          </p>
        </div>
      )}
    </div>
  );
}
