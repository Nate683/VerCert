import { listProducts } from "@/lib/products";
import { toStorefrontProduct } from "@/lib/products/storefront";
import { withStock } from "@/lib/inventory";
import { withCertifiedPurity } from "@/lib/products/certified-purity";
import { ShopClient } from "./ShopClient";
import { isOrderingEnabled } from "@/lib/ordering";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Shop | VeriCert",
  description: "Browse VeriCert's catalog of research peptides and reference compounds, each lot to be third-party tested.",
  path: "/shop",
});

// Products live in Postgres and can change anytime via the executive
// Products tab, so this page is rendered on demand rather than prebuilt.
export const dynamic = "force-dynamic";

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  // ?q= (a search started from the header's SEE ALL RESULTS) is read here and passed down, rather than read with
  // useSearchParams in the client: that hook suspends during server rendering, which streamed a skeleton first and
  // swapped the catalog in a moment later (the flash on load and refresh).
  const { q } = await searchParams;
  const urlQuery = typeof q === "string" ? q : "";
  const [products, orderingEnabled] = await Promise.all([
    listProducts().then(withStock).then(withCertifiedPurity),
    isOrderingEnabled(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
      <div className="border-b border-hairline pb-8">
        <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Catalog</p>
        <h1 className="mt-3 font-serif text-4xl text-navy">Research Compounds</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          Every compound is supplied strictly for laboratory research and will
          be accompanied by an independent certificate of analysis. Not for
          human or veterinary use.
        </p>
      </div>
      <div className="pt-8">
        <ShopClient products={products.map(toStorefrontProduct)} orderingEnabled={orderingEnabled} urlQuery={urlQuery} />
      </div>
    </div>
  );
}
