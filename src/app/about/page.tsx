import { VialGlyph } from "@/components/VialGlyph";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "About | VeriCert",
  description: "VeriCert supplies third-party tested research peptides and reference compounds for laboratory use.",
  path: "/about",
});

const PILLARS = [
  {
    title: "Sourced with Rigor",
    body: "We work with synthesis partners who follow documented quality processes for every production lot.",
  },
  {
    title: "Tested Independently",
    body: "No batch ships without third-party laboratory analysis confirming identity and purity.",
  },
  {
    title: "Transparent by Default",
    body: "Certificates of analysis are available for every batch number, not just on request.",
  },
];

export default function AboutPage() {
  return (
    <div>
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center lg:px-10">
          <p className="text-xs uppercase tracking-[0.35em] text-gold">About VeriCert</p>
          <h1 className="mt-4 font-serif text-4xl text-white lg:text-5xl">
            Built for the Bench, Not the Bottle
          </h1>
          <p className="mt-6 text-base leading-relaxed text-white/60">
            VeriCert exists to give researchers a dependable source of
            synthetic peptides and reference compounds — supplied with the
            documentation and analytical rigor that laboratory work demands.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-24 lg:px-10">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-3">
          {PILLARS.map((pillar) => (
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
          <h2 className="font-serif text-3xl text-white">Our Standard</h2>
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-white/60">
            <p>
              Every compound in the VeriCert catalog is manufactured under
              controlled conditions and analyzed by an accredited third-party
              laboratory before release. Analytical methods include
              reverse-phase HPLC for purity quantification and mass
              spectrometry for identity confirmation.
            </p>
            <p>
              We publish a full certificate of analysis for each batch,
              searchable by batch number, so any researcher can verify what
              they have received against an independent lab report.
            </p>
            <p className="text-white/40">
              VeriCert products are supplied strictly for laboratory research
              use. They are not drugs, foods, dietary supplements, or
              cosmetics, and are not intended for human or veterinary use.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
