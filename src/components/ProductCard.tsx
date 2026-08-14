import Link from "next/link";
import type { Product } from "@/lib/types";
import { VialGlyph } from "./VialGlyph";

export function ProductCard({ product }: { product: Product }) {
  const minPrice = Math.min(...product.sizes.map((s) => s.priceUsd));

  return (
    <Link
      href={`/shop/${product.slug}`}
      className="group flex flex-col border border-white/10 bg-white/[0.02] p-6 transition-colors duration-300 hover:border-gold/50"
    >
      <div className="flex h-40 items-center justify-center text-white/25 transition-colors duration-300 group-hover:text-gold/70">
        <VialGlyph className="h-28 w-28" />
      </div>
      <div className="mt-6 border-t border-white/10 pt-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold/80">
          {product.category}
        </p>
        <h3 className="mt-2 font-serif text-xl text-white">{product.name}</h3>
        <p className="mt-1 font-mono text-xs text-white/40">CAS {product.casNumber}</p>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-white/60">{product.purityPercent.toFixed(1)}% purity</span>
          <span className="text-white">from ${minPrice}</span>
        </div>
      </div>
    </Link>
  );
}
