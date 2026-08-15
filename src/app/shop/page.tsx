import { listProducts } from "@/lib/products";
import { ShopClient } from "./ShopClient";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Shop | VeriCert",
  description: "Browse VeriCert's catalog of third-party tested research peptides and reference compounds.",
  path: "/shop",
});

// Products live in Postgres and can change anytime via the executive
// Products tab, so this page is rendered on demand rather than prebuilt.
export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const products = await listProducts();

  return (
    <div className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
      <div className="border-b border-white/10 pb-8">
        <p className="text-xs uppercase tracking-[0.35em] text-gold">Catalog</p>
        <h1 className="mt-3 font-serif text-4xl text-white">Research Compounds</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/50">
          Every compound is supplied strictly for laboratory research and is
          accompanied by an independent certificate of analysis. Not for
          human or veterinary use.
        </p>
      </div>
      <div className="pt-8">
        <ShopClient products={products} />
      </div>
    </div>
  );
}
