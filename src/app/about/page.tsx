import { VeriCertLogo } from "@/components/VeriCertLogo";
import { EditableText } from "@/components/EditableText";
import { buildMetadata } from "@/lib/seo";
import { getContent, DEFAULT_ABOUT } from "@/lib/site-content";

export const metadata = buildMetadata({
  title: "About | VeriCert",
  description:
    "VeriCert Peptides supplies research compounds to verified independent, corporate and institutional research entities. Every lot will be independently validated.",
  path: "/about",
});

export const dynamic = "force-dynamic";

// Solid white throughout: no photos, overlays or banded sections. The navy
// logo file has a white background of its own, so it only sits on bg-paper.
export default async function AboutPage() {
  const content = { ...DEFAULT_ABOUT, ...(await getContent("about_page", DEFAULT_ABOUT)) };

  return (
    <div className="bg-paper">
      {/* Top padding pt-24 → pt-14 and logo gap mt-10 → mt-8 offset most of the larger logo's extra height. */}
      <div className="mx-auto max-w-4xl px-4 pt-14 pb-12">
        <section className="text-center">
          {/* 2× the previous 104px-tall logo: 472px wide (441:194 file ratio, h-auto keeps it), max-w-full scales it
              down with the column on phones. */}
          <VeriCertLogo className="mx-auto h-auto w-[472px] max-w-full" ground="light" priority />
          <EditableText value={content.headline} as="h1" className="mt-8 font-serif text-4xl text-navy lg:text-5xl" contentKey="about_page" field="headline" />
          {/* Two paragraphs in one editable field, separated by a blank line. */}
          <EditableText value={content.intro} as="p" multiline className="mt-6 whitespace-pre-line text-base leading-relaxed text-muted" contentKey="about_page" field="intro" />
        </section>

        {/* Motto: the page's own serif, set apart by size and colour only. */}
        <p className="mt-16 text-center font-serif text-xl text-gold-ink sm:text-2xl">
          Don&apos;t just trust our brand. Verify our standards.
        </p>

        <section className="pt-20">
          <h2 className="text-center text-xs uppercase tracking-[0.35em] text-gold-ink">{content.valuesHeading}</h2>
          <EditableText value={content.valuesIntro} as="p" multiline className="mt-6 text-center text-sm leading-relaxed text-muted" contentKey="about_page" field="valuesIntro" />

          <ol className="mt-12 space-y-6">
            {content.pillars.map((pillar, i) => (
              // Border one small step darker than slate-300 (inline utility, About only — not a shared token).
              <li key={pillar.title} className="border border-slate-400/70 bg-paper p-8">
                <p className="font-mono text-xs text-gold-ink">{i + 1}.</p>
                <h3 className="mt-2 text-sm uppercase tracking-[0.2em] text-navy">{pillar.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{pillar.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
