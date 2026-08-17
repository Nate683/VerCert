"use client";

import Link from "next/link";
import Image from "next/image";
import { useRecentlyViewed } from "@/lib/recently-viewed";
import { useCatalog } from "@/lib/use-catalog";

/**
 * The compounds this customer has already looked at, most recent first.
 * Renders nothing at all until there are at least two — a strip of one is
 * just clutter.
 */
export function RecentlyViewed({
  excludeSlug,
  className = "",
  title = "Recently Viewed",
}: {
  excludeSlug?: string;
  className?: string;
  title?: string;
}) {
  const slugs = useRecentlyViewed(excludeSlug);
  // Nothing to look up until at least two compounds have been viewed, so the
  // catalog request never fires for a first-time visitor.
  const { entries } = useCatalog(slugs.length >= 2);

  const items = slugs
    .map((slug) => entries.find((e) => e.slug === slug))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .slice(0, 6);

  if (items.length < 2) return null;

  return (
    <section className={className}>
      <h2 className="text-xs uppercase tracking-[0.3em] text-gold">{title}</h2>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item) => (
          <Link
            key={item.slug}
            href={`/shop/${item.slug}`}
            className="group border border-white/10 transition-colors hover:border-gold/50"
          >
            <span className="relative block aspect-square w-full overflow-hidden bg-white/[0.02]">
              {item.imageUrl && (
                <Image
                  src={item.imageUrl}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 16vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
              )}
            </span>
            <span className="block p-3">
              <span className="block truncate text-xs text-white">{item.name}</span>
              <span className="mt-0.5 block text-[11px] text-gold">from ${item.minPriceUsd}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
