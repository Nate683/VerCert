"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/lib/products";
import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/ProductCard";
import { RecentlyViewed } from "@/components/RecentlyViewed";

type SortOption = "name" | "price-asc" | "price-desc" | "purity";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "name", label: "Name (A–Z)" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "purity", label: "Purity: High to Low" },
];

const PURITY_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 98, label: "98%+" },
  { value: 99, label: "99%+" },
];

function minPrice(product: Product): number {
  return Math.min(...product.sizes.map((s) => s.priceUsd));
}

function matchesQuery(product: Product, query: string): boolean {
  if (query.length === 0) return true;
  const digits = query.replace(/[^a-z0-9]/g, "");
  const cas = product.casNumber.toLowerCase();
  return (
    product.name.toLowerCase().includes(query) ||
    cas.includes(query) ||
    (digits.length >= 3 && cas.replace(/[^a-z0-9]/g, "").includes(digits)) ||
    product.category.toLowerCase().includes(query)
  );
}

export function ShopClient({ products }: { products: Product[] }) {
  return (
    <Suspense fallback={<CatalogSkeleton />}>
      <ShopCatalog products={products} />
    </Suspense>
  );
}

function ShopCatalog({ products }: { products: Product[] }) {
  const searchParams = useSearchParams();
  // A search started from the header lands here as ?q= — pick it up so the
  // customer sees the same query they typed, already applied. Adjusted during
  // render rather than in an effect, so the first paint is already filtered.
  const urlQuery = searchParams.get("q") ?? "";
  const [appliedUrlQuery, setAppliedUrlQuery] = useState(urlQuery);
  const [query, setQuery] = useState(urlQuery);
  if (urlQuery !== appliedUrlQuery) {
    setAppliedUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [sort, setSort] = useState<SortOption>("name");
  const [minPurity, setMinPurity] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const priceCeiling = useMemo(
    () => Math.ceil(Math.max(10, ...products.map(minPrice)) / 10) * 10,
    [products]
  );
  const [maxPrice, setMaxPrice] = useState(priceCeiling);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = products.filter(
      (p) =>
        (category === "All" || p.category === category) &&
        matchesQuery(p, q) &&
        p.purityPercent >= minPurity &&
        minPrice(p) <= maxPrice
    );

    return result.sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return minPrice(a) - minPrice(b);
        case "price-desc":
          return minPrice(b) - minPrice(a);
        case "purity":
          return b.purityPercent - a.purityPercent;
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [products, category, query, sort, minPurity, maxPrice]);

  const activeFilters = [
    category !== "All" && { label: category, clear: () => setCategory("All") },
    query.trim() && { label: `“${query.trim()}”`, clear: () => setQuery("") },
    minPurity > 0 && { label: `${minPurity}%+ purity`, clear: () => setMinPurity(0) },
    maxPrice < priceCeiling && { label: `Under $${maxPrice}`, clear: () => setMaxPrice(priceCeiling) },
  ].filter((f): f is { label: string; clear: () => void } => Boolean(f));

  function clearAll() {
    setCategory("All");
    setQuery("");
    setMinPurity(0);
    setMaxPrice(priceCeiling);
  }

  const filterControls = (
    <div className="space-y-8">
      <fieldset>
        <legend className="text-[11px] uppercase tracking-[0.2em] text-gold">Category</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`border px-3 py-1.5 text-xs tracking-[0.08em] transition-colors ${
                category === c
                  ? "border-gold bg-gold text-black"
                  : "border-white/15 text-white/60 hover:border-gold hover:text-gold"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[11px] uppercase tracking-[0.2em] text-gold">Purity</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {PURITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={minPurity === option.value}
              onClick={() => setMinPurity(option.value)}
              className={`border px-3 py-1.5 text-xs tracking-[0.08em] transition-colors ${
                minPurity === option.value
                  ? "border-gold bg-gold text-black"
                  : "border-white/15 text-white/60 hover:border-gold hover:text-gold"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="max-price" className="text-[11px] uppercase tracking-[0.2em] text-gold">
          Price
        </label>
        <p className="mt-2 font-mono text-sm text-white">
          {maxPrice >= priceCeiling ? "Any price" : `Up to $${maxPrice}`}
        </p>
        <input
          id="max-price"
          type="range"
          min={10}
          max={priceCeiling}
          step={5}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="mt-2 w-full accent-[#c9a227]"
        />
        <div className="flex justify-between font-mono text-[10px] text-white/30">
          <span>$10</span>
          <span>${priceCeiling}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Search + sort bar. Filtering is instant — there is no Apply button to
          press and nothing to wait for. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="shop-search" className="sr-only">
            Search by name or CAS number
          </label>
          <input
            id="shop-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or CAS number…"
            className="w-full border border-white/15 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-gold focus:outline-none"
          />
        </div>
        <label htmlFor="shop-sort" className="sr-only">
          Sort products
        </label>
        <select
          id="shop-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="border border-white/15 bg-navy-deep px-4 py-2.5 text-xs uppercase tracking-[0.1em] text-white/70 focus:border-gold focus:outline-none"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort: {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          className="border border-white/15 px-4 py-2.5 text-xs uppercase tracking-[0.1em] text-white/70 transition-colors hover:border-gold hover:text-gold lg:hidden"
        >
          Filters{activeFilters.length > 0 ? ` (${activeFilters.length})` : ""}
        </button>
      </div>

      {filtersOpen && (
        <div className="pop-in mt-4 border border-white/10 p-5 lg:hidden">{filterControls}</div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[210px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-28">{filterControls}</div>
        </aside>

        <div>
          <div className="flex flex-wrap items-center gap-3 border-b border-white/10 pb-4">
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">
              {filtered.length} {filtered.length === 1 ? "compound" : "compounds"}
            </p>
            {activeFilters.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={filter.clear}
                className="flex items-center gap-1.5 border border-gold/40 bg-gold/5 px-2.5 py-1 text-[11px] text-gold transition-colors hover:bg-gold/15"
              >
                {filter.label}
                <span aria-hidden="true">×</span>
                <span className="sr-only">Remove filter</span>
              </button>
            ))}
            {activeFilters.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] uppercase tracking-[0.12em] text-white/40 underline-offset-4 hover:text-gold hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          {filtered.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((product) => (
                <ProductCard key={product.slug} product={product} />
              ))}
            </div>
          ) : (
            <div className="mt-20 flex flex-col items-center text-center">
              <p className="font-serif text-2xl text-white">No compounds match</p>
              <p className="mt-2 max-w-sm text-sm text-white/50">
                Nothing in the catalog fits every filter at once. Try clearing
                one of them, or search by CAS number instead.
              </p>
              <button
                type="button"
                onClick={clearAll}
                className="mt-6 border border-gold px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-gold transition-colors hover:bg-gold hover:text-black"
              >
                Clear all filters
              </button>
            </div>
          )}

          <RecentlyViewed className="mt-20" />
        </div>
      </div>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="border border-white/10">
          <div className="skeleton aspect-square w-full" />
          <div className="space-y-3 p-6">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}
