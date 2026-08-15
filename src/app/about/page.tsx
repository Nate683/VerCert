import { VialGlyph } from "@/components/VialGlyph";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_ABOUT } from "@/lib/site-content";

export const metadata = buildMetadata({
  title: "About | VeriCert",
  description: "VeriCert supplies third-party tested research peptides and reference compounds for laboratory use.",
  path: "/about",
});

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const content = await getContent("about_page", DEFAULT_ABOUT);

  return (
    <div>
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center lg:px-10">
          <p className="text-xs uppercase tracking-[0.35em] text-gold">{content.badge}</p>
          <h1 className="mt-4 font-serif text-4xl text-white lg:text-5xl">{content.headline}</h1>
          <p className="mt-6 text-base leading-relaxed text-white/60">{content.intro}</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-24 lg:px-10">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-3">
          {content.pillars.map((pillar) => (
            <div key={pillar.title} className="flex flex-col items-center text-center">
              <VialGlyph className="h-12 w-12 text-gold" />
              <h2 className="mt-5 font-serif text-xl text-white">{pillar.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/50">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-3xl px-6 py-24 lg:px-10">
          <h2 className="font-serif text-3xl text-white">{content.standardHeading}</h2>
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-white/60">
            {content.standardParagraphs.map((paragraph, i) => (
              <p
                key={i}
                className={i === content.standardParagraphs.length - 1 ? "text-white/40" : undefined}
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
