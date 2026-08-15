import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug } from "@/lib/products";
import { ProductGallery } from "@/components/ProductGallery";
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
  const product = await getProductBySlug(slug);
  if (!product || product.active === false) notFound();

  const specs = [
    { label: "CAS Number", value: product.casNumber },
    { label: "Molecular Formula", value: product.molecularFormula },
    { label: "Molecular Weight", value: product.molecularWeight },
    { label: "Purity", value: `${product.purityPercent.toFixed(1)}%` },
    { label: "Sequence / Form", value: product.sequenceOrForm },
    { label: "Storage", value: product.storage },
  ];

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
    <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <p className="text-xs uppercase tracking-[0.2em] text-white/40">
        <Link href="/shop" className="hover:text-gold">Shop</Link>
        <span className="mx-2">/</span>
        {product.name}
      </p>

      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-2">
        <ProductGallery
          name={product.name}
          primaryImageUrl={product.primaryImageUrl}
          galleryImageUrls={product.galleryImageUrls}
        />

        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">
            {product.category}
          </p>
          <h1 className="mt-3 font-serif text-4xl text-white">{product.name}</h1>
          <p className="mt-4 text-sm leading-relaxed text-white/60">{product.summary}</p>

          <dl className="mt-8 divide-y divide-white/10 border-y border-white/10">
            {specs.map((spec) => (
              <div key={spec.label} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
                <dt className="text-xs uppercase tracking-[0.15em] text-white/40">
                  {spec.label}
                </dt>
                <dd className="text-sm text-white sm:text-right">{spec.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8">
            <AddToCartPanel product={product} />
          </div>
        </div>
      </div>

      <div className="mt-20 grid grid-cols-1 gap-12 border-t border-white/10 pt-12 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-serif text-2xl text-white">Product Description</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-white/60">
            {product.description.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-serif text-2xl text-white">Available Batches</h2>
          <ul className="mt-4 space-y-3">
            {product.batchNumbers.map((batch) => (
              <li key={batch}>
                <Link
                  href={`/coa?batch=${batch}`}
                  className="flex items-center justify-between border border-white/10 px-4 py-3 text-sm text-white/70 transition-colors hover:border-gold hover:text-gold"
                >
                  <span className="font-mono">{batch}</span>
                  <span className="text-xs uppercase tracking-[0.15em]">View COA →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
