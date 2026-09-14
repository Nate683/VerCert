import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug, listProducts } from "@/lib/products";
import { toStorefrontProduct } from "@/lib/products/storefront";
import { ProductGallery } from "@/components/ProductGallery";
import { ProductCard } from "@/components/ProductCard";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { RecordProductView } from "@/components/RecordProductView";
import { AddToCartPanel } from "./AddToCartPanel";
import { buildMetadata } from "@/lib/seo";

type Params = { slug: string };

// Products live in Postgres and can change anytime via the executive
// Products tab, so this page is rendered on demand rather than prebuilt.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || product.active === false)
    return buildMetadata({ title: "Product Not Found | VeriCert", noIndex: true });
  return buildMetadata({
    title: `${product.name} | VeriCert`,
    description: product.summary,
    path: `/shop/${product.slug}`,
  });
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const [product, allProducts] = await Promise.all([getProductBySlug(slug), listProducts()]);
  if (!product || product.active === false) notFound();

  // Related = same category first, then anything else, so the rail is never
  // short on a thin category.
  const related = [
    ...allProducts.filter((p) => p.slug !== product.slug && p.category === product.category),
    ...allProducts.filter((p) => p.slug !== product.slug && p.category !== product.category),
  ].slice(0, 4);

  const specs = [
    { label: "CAS Number", value: product.casNumber, mono: true },
    { label: "Molecular Formula", value: product.molecularFormula, mono: true },
    { label: "Molecular Weight", value: product.molecularWeight, mono: true },
    { label: "Purity", value: `${product.purityPercent.toFixed(1)}%`, mono: true },
    { label: "Sequence / Form", value: product.sequenceOrForm, mono: false },
    { label: "Storage", value: product.storage, mono: false },
  ];

  const primaryBatch = product.batchNumbers[0];
  const minPrice = Math.min(...product.sizes.map((s) => s.priceUsd));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.summary,
    category: product.category,
    brand: { "@type": "Brand", name: "VeriCert" },
    additionalProperty: [
      { "@type": "PropertyValue", name: "CAS Number", value: product.casNumber },
      { "@type": "PropertyValue", name: "Molecular Formula", value: product.molecularFormula },
      { "@type": "PropertyValue", name: "Purity", value: `${product.purityPercent.toFixed(1)}%` },
    ],
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: minPrice,
      highPrice: Math.max(...product.sizes.map((s) => s.priceUsd)),
      offerCount: product.sizes.length,
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <RecordProductView slug={product.slug} />

      <nav aria-label="Breadcrumb" className="text-xs uppercase tracking-[0.2em] text-muted">
        <Link href="/shop" className="transition-colors hover:text-gold-ink">
          Shop
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <Link
          href={`/shop?q=${encodeURIComponent(product.category)}`}
          className="transition-colors hover:text-gold-ink"
        >
          {product.category}
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="text-muted">{product.name}</span>
      </nav>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <ProductGallery
            name={product.name}
            primaryImageUrl={product.primaryImageUrl}
            galleryImageUrls={product.galleryImageUrls}
          />
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold-ink">{product.category}</p>
          <h1 className="mt-3 font-serif text-4xl text-navy">{product.name}</h1>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="purity-badge">{product.purityPercent.toFixed(1)}% Purity</span>
            {primaryBatch && (
              <span className="font-mono text-xs text-muted">
                Batch <span className="text-navy">{primaryBatch}</span>
              </span>
            )}
            {primaryBatch && (
              <Link
                href={`/coa?batch=${primaryBatch}`}
                className="text-xs uppercase tracking-[0.12em] text-gold-ink underline-offset-4 hover:underline"
              >
                View COA →
              </Link>
            )}
          </div>

          <p className="mt-5 text-sm leading-relaxed text-muted">{product.summary}</p>

          <div className="mt-8">
            <AddToCartPanel product={toStorefrontProduct(product)} />
          </div>

          <dl className="mt-10 divide-y divide-hairline border-y border-hairline">
            {specs.map((spec) => (
              <div
                key={spec.label}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between"
              >
                <dt className="text-xs uppercase tracking-[0.15em] text-muted">{spec.label}</dt>
                <dd className={`text-sm text-navy sm:text-right ${spec.mono ? "font-mono" : ""}`}>
                  {spec.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-12 border-t border-hairline pt-12 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-serif text-2xl text-navy">Product Description</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted">
            {product.description.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-serif text-2xl text-navy">Available Batches</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Each batch is tested independently. Match the number on your vial
            label to pull its certificate.
          </p>
          <ul className="mt-4 space-y-3">
            {product.batchNumbers.map((batch) => (
              <li key={batch}>
                <Link
                  href={`/coa?batch=${batch}`}
                  className="flex items-center justify-between border border-hairline px-4 py-3 text-sm text-muted transition-colors hover:border-gold hover:text-gold-ink"
                >
                  <span className="font-mono">{batch}</span>
                  <span className="text-xs uppercase tracking-[0.15em]">View COA →</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/how-we-test"
            className="mt-6 inline-block text-xs uppercase tracking-[0.15em] text-muted underline-offset-4 transition-colors hover:text-gold-ink hover:underline"
          >
            How we test →
          </Link>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20 border-t border-hairline pt-12">
          <div className="flex items-end justify-between">
            <h2 className="font-serif text-2xl text-navy">Related Compounds</h2>
            <Link
              href="/shop"
              className="underline-draw hidden text-sm uppercase tracking-[0.15em] text-muted hover:text-gold-ink sm:block"
            >
              View All →
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.slug} product={toStorefrontProduct(item)} />
            ))}
          </div>
        </section>
      )}

      <RecentlyViewed excludeSlug={product.slug} className="mt-20 border-t border-hairline pt-12" />
    </div>
  );
}
