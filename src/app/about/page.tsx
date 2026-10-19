import { VeriCertLogo } from "@/components/VeriCertLogo";
import { EditableText } from "@/components/EditableText";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_ABOUT } from "@/lib/site-content";

export const metadata = buildMetadata({
  title: "About | VeriCert",
  description:
    "VeriCert Peptides supplies independently validated research compounds to verified independent, corporate and institutional research entities.",
  path: "/about",
});

export const dynamic = "force-dynamic";

// Solid white throughout: no photos, overlays or banded sections. The navy
// logo file has a white background of its own, so it only sits on bg-paper.
export default async function AboutPage() {
  const content = { ...DEFAULT_ABOUT, ...(await getContent("about_page", DEFAULT_ABOUT)) };

  return (
    <div className="bg-paper">
      <section className="mx-auto max-w-3xl px-6 pt-24 text-center lg:px-10">
        <VeriCertLogo className="mx-auto h-20 w-auto" ground="light" priority />
        <EditableText value={content.headline} as="h1" className="mt-10 font-serif text-4xl text-navy lg:text-5xl" contentKey="about_page" field="headline" />
        <EditableText value={content.intro} as="p" multiline className="mt-6 text-base leading-relaxed text-muted" contentKey="about_page" field="intro" />
      </section>

      <section className="mx-auto max-w-3xl px-6 py-20 lg:px-10">
        <h2 className="text-center text-xs uppercase tracking-[0.35em] text-gold-ink">{content.valuesHeading}</h2>
        <EditableText value={content.valuesIntro} as="p" multiline className="mt-6 text-center text-sm leading-relaxed text-muted" contentKey="about_page" field="valuesIntro" />

        <ol className="mt-12 space-y-6">
          {content.pillars.map((pillar, i) => (
            <li key={pillar.title} className="border border-hairline bg-paper p-8">
              <p className="font-mono text-xs text-gold-ink">{i + 1}.</p>
              <h3 className="mt-2 text-sm uppercase tracking-[0.2em] text-navy">{pillar.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{pillar.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
