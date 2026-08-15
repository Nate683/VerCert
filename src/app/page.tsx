import Link from "next/link";
import Image from "next/image";
import { listProducts } from "@/lib/products";
import { ProductCard } from "@/components/ProductCard";
import { VialGlyph } from "@/components/VialGlyph";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_HOME_HERO, DEFAULT_FEATURED } from "@/lib/site-content";

export const metadata = buildMetadata({
  title: "VeriCert | Research Peptides, Verified",
  description:
    "High-purity synthetic peptides and reference compounds for laboratory research, each accompanied by an independent certificate of analysis.",
  path: "/",
});

// Products live in Postgres and can change anytime via the executive
// Products tab, so this page is rendered on demand rather than prebuilt.
export const dynamic = "force-dynamic";

const TRUST_POINTS = [
  {
    title: "HPLC-MS Verified",
    body: "Every lot is analyzed by reverse-phase HPLC and mass spectrometry to confirm identity and quantify purity before release.",
  },
  {
    title: "Certificate Per Batch",
    body: "A full certificate of analysis is issued for each production batch and archived for independent verification at any time.",
  },
  {
    title: "Independent Laboratories",
    body: "Testing is performed by accredited third-party analytical laboratories with no affiliation to VeriCert.",
  },
];

export default async function Home() {
  const [products, hero, featuredContent] = await Promise.all([
    listProducts(),
    getContent("home_hero", DEFAULT_HOME_HERO),
    getContent("featured_products", DEFAULT_FEATURED),
  ]);
  const featured =
    featuredContent.slugs.length > 0
      ? featuredContent.slugs
          .map((slug) => products.find((p) => p.slug === slug))
          .filter((p): p is (typeof products)[number] => Boolean(p))
      : products.slice(0, 4);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-6 py-28 text-center lg:px-10 lg:py-40">
          <p className="text-xs uppercase tracking-[0.4em] text-gold">
            {hero.badge}
          </p>
          <h1 className="mt-8 max-w-3xl whitespace-pre-line font-serif text-5xl leading-tight text-white text-balance lg:text-7xl">
            {hero.headline}
          </h1>
          <div className="mt-8 h-px w-24 bg-gold/60" />
          <p className="mt-8 max-w-xl text-base leading-relaxed text-white/60">
            {hero.subtext}
          </p>
          <div className="mt-12 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/shop"
              className="border border-gold bg-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold"
            >
              {hero.ctaPrimaryLabel}
            </Link>
            <Link
              href="/coa"
              className="border border-white/20 px-8 py-3 text-sm uppercase tracking-[0.2em] text-white/80 transition-colors hover:border-gold hover:text-gold"
            >
              {hero.ctaSecondaryLabel}
            </Link>
          </div>
          {hero.heroImageUrl && (
            <div className="relative mt-16 aspect-[16/9] w-full max-w-3xl overflow-hidden border border-white/10">
              <Image src={hero.heroImageUrl} alt="" fill sizes="(max-width: 768px) 100vw, 768px" className="object-cover" />
            </div>
          )}
        </div>
      </section>

      {/* Featured products */}
      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
        <div className="flex items-end justify-between border-b border-white/10 pb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-gold">
              Featured Compounds
            </p>
            <h2 className="mt-3 font-serif text-3xl text-white">
              Selected for the Bench
            </h2>
          </div>
          <Link
            href="/shop"
            className="hidden text-sm uppercase tracking-[0.15em] text-white/60 hover:text-gold sm:block"
          >
            View All →
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
      </section>

      {/* Trust section */}
      <section className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-gold">
              Third-Party Testing
            </p>
            <h2 className="mt-3 font-serif text-3xl text-white">
              Verification, Not Assumption
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/50">
              Every compound VeriCert distributes is tested by an independent
              laboratory before it reaches a researcher&apos;s bench.
            </p>
          </div>
          <div className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-3">
            {TRUST_POINTS.map((point) => (
              <div key={point.title} className="flex flex-col items-center text-center">
                <VialGlyph className="h-14 w-14 text-gold" />
                <h3 className="mt-6 font-serif text-xl text-white">{point.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/50">{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-24 text-center lg:px-10">
        <h2 className="font-serif text-3xl text-white lg:text-4xl">
          Every Batch. Certified.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/50">
          Already have a product in hand? Enter its batch number to view the
          independent lab report.
        </p>
        <Link
          href="/coa"
          className="mt-8 inline-block border border-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-black"
        >
          Verify a Certificate
        </Link>
      </section>
    </div>
  );
}
