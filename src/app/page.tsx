import Link from "next/link";
import Image from "next/image";
import { listProducts } from "@/lib/products";
import { toStorefrontProduct, withPublicPrice } from "@/lib/products/storefront";
import { withStock } from "@/lib/inventory";
import { withCertifiedPurity } from "@/lib/products/certified-purity";
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
    "Synthetic peptides and reference compounds for laboratory research. Each lot will be accompanied by an independent certificate of analysis.",
  path: "/",
});

// Products live in Postgres and can change anytime via the executive
// Products tab, so this page is rendered on demand rather than prebuilt.
export const dynamic = "force-dynamic";

// Owner-approved wording, November 7 2026. Analytical methods are described on
// /how-we-test, not here.
const TRUST_POINTS = [
  {
    title: "Independently Verified",
    body: "Each received lot undergoes independent laboratory analysis against VeriCert's established quality specifications before release.",
  },
  {
    title: "Certificate Per Lot",
    body: "VeriCert randomly selects samples from each received lot for independent testing, with results documented in a lot-specific Certificate of Analysis.",
  },
  {
    title: "Independent Laboratories",
    body: "Testing is performed by independent third-party laboratories, with applicable accreditation verified for the services provided.",
  },
];

export default async function Home() {
  const [products, hero, featuredContent, sections, customer] = await Promise.all([
    listProducts().then(withStock).then(withCertifiedPurity),
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
      <section className="@container relative isolate flex min-h-[85vh] items-center overflow-hidden border-b border-hairline bg-paper">
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

        {/* Top padding is trimmed by exactly what the larger logo adds (it was
            py-28 with a 200 × 88 logo), so the headline and the hero's height
            stay where they were. */}
        {/* The bottom padding keeps the clear space under the button: 112px on
            phones, 136px from sm (the space the hero has held since the motto
            was added and then removed, so its height is unchanged). */}
        <div className="relative mx-auto flex w-full max-w-7xl flex-col items-center px-6 pt-[110px] pb-28 text-center sm:pt-[91.5px] sm:pb-[136px] lg:px-10">
          {/* Left edge watermark: the gray emblem, oversized and cropped by the
              page's left edge, as on the packaging. The layer is inset by this
              wrapper's own padding, so it is exactly as tall as the content
              group (logo top to button bottom) and the emblem is 87.5% of that
              height, centred on it. It spans the hero's full width (100cqw of
              the section, which excludes the scrollbar) so the crop is measured
              from the page edge: 45% off the edge from 1400px, 75% from lg to
              1399px; hidden below lg. Decorative only: behind the content, no
              pointer events, hidden from assistive tech, 5% opacity on the
              emblem alone. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-[110px] bottom-[136px] left-1/2 -z-[1] hidden w-[100cqw] -translate-x-1/2 select-none sm:top-[91.5px] lg:block"
          >
            <Image
              src="/VeriCert-Emblem-Gray.svg"
              alt=""
              width={312}
              height={345}
              unoptimized
              className="absolute top-1/2 left-0 h-[87.5%] w-auto max-w-none -translate-x-[75%] -translate-y-1/2 opacity-5 min-[1400px]:-translate-x-[45%]"
            />
          </div>
          {/* Full-colour lockup, as a vector. The artwork fills 267 × 118 of
              its 298 × 149 viewBox: at 217px wide it shows ≈194.5 × 85.8, 1.6×
              the old JPG's 121.5 × 53.1 visible artwork. 180px on phones. */}
          <Image
            src="/VeriCert-Peptides-Full-Color-RGB-V2.svg"
            alt="VeriCert Peptides"
            width={298}
            height={149}
            unoptimized
            priority
            className="mx-auto block h-auto w-[180px] sm:w-[217px]"
          />
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
        {/* Lower-right emblem: the same gray emblem, small and complete, set in
            the white space below and right of the content, a counterweight to
            the large cropped one on the left. Original orientation, 5% opacity,
            fully inside the hero. The circle fills 275 of the file's 312 units
            of width, so 272px wide draws a ≈240px circle (from 1400px); 160px
            (≈141px circle) from lg to 1399px, where a larger one would crowd
            the paragraph; hidden below lg. Decorative only. */}
        <Image
          src="/VeriCert-Emblem-Gray.svg"
          alt=""
          aria-hidden="true"
          width={312}
          height={345}
          unoptimized
          className="pointer-events-none absolute right-8 bottom-8 -z-[1] hidden h-auto w-[160px] select-none opacity-5 lg:block min-[1400px]:right-20 min-[1400px]:w-[272px]"
        />
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
              Ordering is reserved for registered research customers. Certificates of Analysis will be
              available for public verification without requiring an account.{" "}
              {/* A deeper gold than gold-ink (#82673B, 5.31:1 on white) so the link
                  reads as clearly clickable at this size: #6E5530, 6.99:1. */}
              <Link href="/register" className="text-[#6E5530] underline underline-offset-4 hover:text-navy">
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
                Every compound VeriCert distributes will be tested by an independent
                laboratory before it reaches a researcher&apos;s bench.
              </p>
            </ScrollReveal>
            <div className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-3">
              {TRUST_POINTS.map((point, i) => (
                <ScrollReveal key={point.title} delayMs={i * 100} className="flex flex-col items-center text-center">
                  {/* 15% larger than h-14 (56px → 64.4px). The glyph's strokes
                      scale with it, so they're divided by 1.15 (1.5 → 1.304,
                      1 → 0.87) to keep the rendered line weight unchanged. */}
                  <VialGlyph className="h-[64.4px] w-[64.4px] text-gold-ink [&_line]:[stroke-width:0.87] [&_path]:[stroke-width:1.304] [&_rect]:[stroke-width:1.304]" />
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
              Already have a product in hand? Enter its lot number to pull the independent laboratory report.
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
