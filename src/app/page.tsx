import Link from "next/link";
import Image from "next/image";
import { listProducts } from "@/lib/products";
import { HomeFeaturedGrid } from "@/components/HomeFeaturedGrid";
import { VialGlyph } from "@/components/VialGlyph";
import { VeriCertLogo } from "@/components/VeriCertLogo";
import { ScrollReveal } from "@/components/ScrollReveal";
import { EditableText } from "@/components/EditableText";
import { EditableImage } from "@/components/EditableImage";
import { SectionToggle } from "@/components/SectionToggle";
import { CoaQuickLookup } from "@/components/CoaQuickLookup";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_HOME_HERO, DEFAULT_FEATURED, DEFAULT_HOME_SECTIONS } from "@/lib/site-content";

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
  const [products, hero, featuredContent, sections] = await Promise.all([
    listProducts(),
    getContent("home_hero", DEFAULT_HOME_HERO),
    getContent("featured_products", DEFAULT_FEATURED),
    getContent("home_sections", DEFAULT_HOME_SECTIONS),
  ]);
  const featured =
    featuredContent.slugs.length > 0
      ? featuredContent.slugs
          .map((slug) => products.find((p) => p.slug === slug))
          .filter((p): p is (typeof products)[number] => Boolean(p))
      : products.slice(0, 4);

  return (
    <div>
      {/* Hero — full-width background image with a gradient scrim, logo and
          headline overlaid. Falls back to the navy gradient when no hero
          image has been uploaded yet. */}
      <section className="relative isolate flex min-h-[85vh] items-center overflow-hidden border-b border-white/10">
        {hero.heroImageUrl ? (
          <EditableImage contentKey="home_hero" field="heroImageUrl">
            <Image
              src={hero.heroImageUrl}
              alt=""
              fill
              priority
              sizes="100vw"
              className="absolute inset-0 -z-10 object-cover"
            />
          </EditableImage>
        ) : (
          <EditableImage contentKey="home_hero" field="heroImageUrl">
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-navy via-navy to-black" />
          </EditableImage>
        )}
        {/* Gradient scrim: darkest at the bottom/edges so overlaid text and the
            footer transition both stay legible regardless of the photo. */}
        <div className="absolute inset-0 -z-[5] bg-gradient-to-t from-black via-black/60 to-black/20" />
        <div className="absolute inset-0 -z-[5] bg-gradient-to-r from-black/70 via-black/20 to-black/70" />

        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-6 py-28 text-center lg:px-10">
          <VeriCertLogo className="h-14 w-auto drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]" priority />
          <EditableText
            value={hero.badge}
            as="p"
            className="mt-8 text-xs uppercase tracking-[0.4em] text-gold"
            contentKey="home_hero"
            field="badge"
          />
          <EditableText
            value={hero.headline}
            as="h1"
            multiline
            className="mt-6 max-w-3xl whitespace-pre-line font-serif text-5xl leading-tight text-white text-balance drop-shadow-[0_2px_16px_rgba(0,0,0,0.5)] lg:text-7xl"
            contentKey="home_hero"
            field="headline"
          />
          <div className="mt-8 h-px w-24 bg-gold/60" />
          <EditableText
            value={hero.subtext}
            as="p"
            multiline
            className="mt-8 max-w-xl text-base leading-relaxed text-white/70"
            contentKey="home_hero"
            field="subtext"
          />
          <div className="mt-12 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/shop"
              className="card-elevate border border-gold bg-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:bg-transparent hover:text-gold"
            >
              {hero.ctaPrimaryLabel}
            </Link>
            <Link
              href="/coa"
              className="card-elevate border border-white/20 px-8 py-3 text-sm uppercase tracking-[0.2em] text-white/80 transition-colors hover:border-gold hover:text-gold"
            >
              {hero.ctaSecondaryLabel}
            </Link>
          </div>
        </div>
      </section>

      {/* COA lookup — the first thing under the hero. Verification is the
          product's whole promise, so it isn't buried behind a nav link. */}
      <section className="border-b border-white/10 bg-white/[0.02]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-6 py-12 lg:grid-cols-[1fr_1.1fr] lg:px-10">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-gold">Verify a Batch</p>
            <h2 className="mt-3 font-serif text-2xl text-white">
              Already have a vial? Check its certificate.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/50">
              Enter the batch number printed on the label to pull the
              independent lab report for that exact lot.
            </p>
          </div>
          <CoaQuickLookup />
        </div>
      </section>

      {/* Featured products */}
      <ScrollReveal>
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
              className="underline-draw hidden text-sm uppercase tracking-[0.15em] text-white/60 hover:text-gold sm:block"
            >
              View All →
            </Link>
          </div>
          <HomeFeaturedGrid products={featured} />
        </section>
      </ScrollReveal>

      {/* Trust section */}
      {sections.trust && (
        <section className="texture-diagonal relative border-y border-white/10 bg-white/[0.02]">
          <SectionToggle sectionKey="trust" visible={sections.trust} />
          <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
            <ScrollReveal className="text-center">
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
            </ScrollReveal>
            <div className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-3">
              {TRUST_POINTS.map((point, i) => (
                <ScrollReveal key={point.title} delayMs={i * 100} className="flex flex-col items-center text-center">
                  <VialGlyph className="h-14 w-14 text-gold" />
                  <h3 className="mt-6 font-serif text-xl text-white">{point.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/50">{point.body}</p>
                </ScrollReveal>
              ))}
            </div>
            <ScrollReveal className="mt-14 text-center">
              <Link
                href="/how-we-test"
                className="inline-block border border-white/20 px-8 py-3 text-sm uppercase tracking-[0.2em] text-white/80 transition-colors hover:border-gold hover:text-gold"
              >
                How We Test
              </Link>
            </ScrollReveal>
          </div>
        </section>
      )}

      {/* CTA */}
      {sections.cta && (
        <ScrollReveal>
          <section className="relative mx-auto max-w-7xl px-6 py-24 text-center lg:px-10">
            <SectionToggle sectionKey="cta" visible={sections.cta} />
            <h2 className="font-serif text-3xl text-white lg:text-4xl">
              Every Batch. Certified.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/50">
              Already have a product in hand? Enter its batch number to view the
              independent lab report.
            </p>
            <Link
              href="/coa"
              className="card-elevate mt-8 inline-block border border-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-black"
            >
              Verify a Certificate
            </Link>
          </section>
        </ScrollReveal>
      )}
    </div>
  );
}
