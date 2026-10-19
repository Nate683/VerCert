import Link from "next/link";
import Image from "next/image";
import { listProducts } from "@/lib/products";
import { toStorefrontProduct, withPublicPrice } from "@/lib/products/storefront";
import { withStock } from "@/lib/inventory";
import { getCurrentCustomer } from "@/lib/users/current-user";
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
  const [products, hero, featuredContent, sections, customer] = await Promise.all([
    listProducts().then(withStock),
    getContent("home_hero", DEFAULT_HOME_HERO),
    getContent("featured_products", DEFAULT_FEATURED),
    getContent("home_sections", DEFAULT_HOME_SECTIONS),
    getCurrentCustomer(),
  ]);
  const featured =
    featuredContent.slugs.length > 0
      ? featuredContent.slugs
          .map((slug) => products.find((p) => p.slug === slug))
          .filter((p): p is (typeof products)[number] => Boolean(p))
      : products.slice(0, 4);
  // Signed-out visitors see each tile's lowest unit price (owner's decision,
  // October 18 2026); ordering, quantity breaks and certificates still need
  // an account.
  const signedIn = Boolean(customer);
  const featuredForView = featured.map(signedIn ? toStorefrontProduct : withPublicPrice);

  return (
    <div>
      {/* Hero — a light editorial band. The type is navy with no scrim under
          it, so an uploaded hero photo has to sit behind a heavy paper veil
          rather than carry the composition the way the dark hero did. */}
      <section className="relative isolate flex min-h-[85vh] items-center overflow-hidden border-b border-hairline bg-paper">
        {hero.heroImageUrl ? (
          <>
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
            {/* Paper veil — the light counterpart of the old black scrim.
                Heaviest at the bottom, where the headline and CTAs sit. */}
            <div className="absolute inset-0 -z-[5] bg-gradient-to-t from-paper via-paper/90 to-paper/70" />
          </>
        ) : (
          <EditableImage contentKey="home_hero" field="heroImageUrl">
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-paper via-paper to-surface" />
          </EditableImage>
        )}

        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-6 py-28 text-center lg:px-10">
          <VeriCertLogo className="mx-auto block h-auto w-[200px]" ground="light" priority />
          <EditableText
            value={hero.badge}
            as="p"
            className="mt-8 text-xs uppercase tracking-[0.4em] text-gold-ink"
            contentKey="home_hero"
            field="badge"
          />
          <EditableText
            value={hero.headline}
            as="h1"
            multiline
            className="mt-6 max-w-3xl whitespace-pre-line font-serif text-5xl leading-tight text-navy text-balance lg:text-7xl"
            contentKey="home_hero"
            field="headline"
          />
          <div className="mt-8 h-px w-24 bg-gold-ink/60" />
          <EditableText
            value={hero.subtext}
            as="p"
            multiline
            className="mt-8 max-w-xl text-base leading-relaxed text-navy/80"
            contentKey="home_hero"
            field="subtext"
          />
          <div className="mt-12 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/shop"
              className="card-elevate border border-gold bg-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-black transition-colors hover:border-gold-ink hover:bg-transparent hover:text-gold-ink"
            >
              {hero.ctaPrimaryLabel}
            </Link>
          </div>
        </div>
      </section>

      {/* The rest of the light storefront shell. The hero above is light too
          now, so this wrapper only grounds the sections below it. */}
      <div className="bg-paper text-navy">
      {/* Featured products */}
      <ScrollReveal>
        <section className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
          <div className="flex items-end justify-between border-b border-hairline pb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">
                Featured Compounds
              </p>
              <h2 className="mt-3 font-serif text-3xl text-navy">
                Selected for the Bench
              </h2>
            </div>
            <Link
              href="/shop"
              className="underline-draw py-2 text-sm uppercase tracking-[0.15em] text-muted hover:text-gold-ink"
            >
              View All →
            </Link>
          </div>
          <HomeFeaturedGrid products={featuredForView} pricingLocked={!signedIn} />
          {!signedIn && (
            <p className="mt-8 text-center text-sm text-muted">
              Ordering and batch certificates are for registered researchers.{" "}
              <Link href="/register" className="text-gold-ink underline underline-offset-4 hover:text-navy">
                Create a free account
              </Link>{" "}
              to order.
            </p>
          )}
        </section>
      </ScrollReveal>

      {/* Trust section */}
      {sections.trust && (
        <section className="texture-diagonal relative border-y border-hairline bg-surface">
          <SectionToggle sectionKey="trust" visible={sections.trust} />
          <div className="mx-auto max-w-7xl px-6 py-24 lg:px-10">
            <ScrollReveal className="text-center">
              <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">
                Third-Party Testing
              </p>
              <h2 className="mt-3 font-serif text-3xl text-navy">
                Verification, Not Assumption
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted">
                Every compound VeriCert distributes is tested by an independent
                laboratory before it reaches a researcher&apos;s bench.
              </p>
            </ScrollReveal>
            <div className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-3">
              {TRUST_POINTS.map((point, i) => (
                <ScrollReveal key={point.title} delayMs={i * 100} className="flex flex-col items-center text-center">
                  <VialGlyph className="h-14 w-14 text-gold-ink" />
                  <h3 className="mt-6 font-serif text-xl text-navy">{point.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{point.body}</p>
                </ScrollReveal>
              ))}
            </div>
            <ScrollReveal className="mt-14 text-center">
              <Link
                href="/how-we-test"
                className="inline-block border border-control px-8 py-3 text-sm uppercase tracking-[0.2em] text-muted transition-colors hover:border-gold hover:text-gold-ink"
              >
                How We Test
              </Link>
            </ScrollReveal>
          </div>
        </section>
      )}

      {/* Every Batch. Certified. — full-bleed photo (uploaded in EXEC MODE;
          there is no laboratory photo in the repo yet) under a 75% navy-deep
          overlay, so the text and form stay crisp on any image. The lookup
          form renders only while the lookup flag is on (lib/coa-lookup.ts). */}
      {sections.cta && (
        <section className="relative isolate overflow-hidden bg-navy-deep">
          <SectionToggle sectionKey="cta" visible={sections.cta} />
          <EditableImage contentKey="home_hero" field="certifiedImageUrl">
            {hero.certifiedImageUrl ? (
              <Image src={hero.certifiedImageUrl} alt="" fill sizes="100vw" className="absolute inset-0 -z-20 object-cover" />
            ) : (
              <div className="absolute inset-0 -z-20" />
            )}
          </EditableImage>
          <div className="absolute inset-0 -z-10 bg-navy-deep/75" />
          <ScrollReveal className="relative mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center lg:px-10">
            <VeriCertLogo className="h-14 w-auto" />
            <h2 className="mt-8 font-serif text-3xl text-white lg:text-4xl">Every Batch. Certified.</h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/80">
              Already have a product in hand? Enter its batch number to pull the independent laboratory report.
            </p>
            <div className="mt-8 w-full max-w-xl">
              <CoaQuickLookup tone="dark" id="home-coa-batch" />
            </div>
          </ScrollReveal>
        </section>
      )}
      </div>
    </div>
  );
}
