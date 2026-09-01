import { VialGlyph } from "@/components/VialGlyph";
import { EditableText } from "@/components/EditableText";
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
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center lg:px-10">
          <EditableText value={content.badge} as="p" className="text-xs uppercase tracking-[0.35em] text-gold-ink" contentKey="about_page" field="badge" />
          <EditableText value={content.headline} as="h1" className="mt-4 font-serif text-4xl text-navy lg:text-5xl" contentKey="about_page" field="headline" />
          <EditableText value={content.intro} as="p" multiline className="mt-6 text-base leading-relaxed text-muted" contentKey="about_page" field="intro" />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-24 lg:px-10">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-3">
          {content.pillars.map((pillar) => (
            <div key={pillar.title} className="flex flex-col items-center text-center">
              <VialGlyph className="h-12 w-12 text-gold-ink" />
              <h2 className="mt-5 font-serif text-xl text-navy">{pillar.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-hairline bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-24 lg:px-10">
          <h2 className="font-serif text-3xl text-navy">{content.standardHeading}</h2>
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
            {content.standardParagraphs.map((paragraph, i) => (
              <p
                key={i}
                className={i === content.standardParagraphs.length - 1 ? "text-muted" : undefined}
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
