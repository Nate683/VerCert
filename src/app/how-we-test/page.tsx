import Link from "next/link";
import { VialGlyph } from "@/components/VialGlyph";
import { CoaQuickLookup } from "@/components/CoaQuickLookup";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "How We Test | VeriCert",
  description:
    "How VeriCert verifies every batch: independent HPLC and mass spectrometry analysis, what each figure on a certificate of analysis means, and how to check yours.",
  path: "/how-we-test",
});

const STAGES = [
  {
    step: "01",
    title: "Sampling",
    body: "A representative sample is drawn from each production lot before any of it is packaged. Lots are never pooled — every batch number corresponds to one physical run of material.",
  },
  {
    step: "02",
    title: "Independent Analysis",
    body: "Samples go to accredited third-party analytical laboratories with no commercial relationship to VeriCert. We do not run our own confirmatory testing, because a supplier grading its own work is not verification.",
  },
  {
    step: "03",
    title: "HPLC — Purity",
    body: "Reverse-phase high-performance liquid chromatography separates the sample into its components and measures the proportion attributable to the target compound. That percentage is the purity figure printed on the certificate.",
  },
  {
    step: "04",
    title: "Mass Spectrometry — Identity",
    body: "Mass spectrometry confirms the molecular weight of the primary peak matches the expected compound. Purity without identity is meaningless: it tells you the vial is 99% of something.",
  },
  {
    step: "05",
    title: "Release or Reject",
    body: "A lot that misses its purity specification, or whose identity cannot be confirmed, is not repriced or sold as a lower grade. It does not ship.",
  },
  {
    step: "06",
    title: "Publication",
    body: "The full report is archived against its batch number and published here. It stays available permanently — including after that lot has sold out.",
  },
];

const COA_FIELDS = [
  {
    field: "Batch Number",
    meaning: "The specific production lot. It appears on your vial label and is the key to everything below.",
  },
  {
    field: "Purity (%)",
    meaning: "The proportion of the sample that is the target compound, by HPLC peak area. 98% and above is our release specification.",
  },
  {
    field: "Test Method",
    meaning: "The analytical technique used — typically RP-HPLC for purity and LC-MS for identity confirmation.",
  },
  {
    field: "Date Tested / Issued",
    meaning: "When the laboratory ran the analysis and when it signed the report. Both are on the certificate; neither is back-dated.",
  },
  {
    field: "Laboratory",
    meaning: "The named third-party facility that performed the work, so you can verify the source independently.",
  },
  {
    field: "Appearance",
    meaning: "The physical description of the material as received — colour, form, and condition of the lyophilised cake or powder.",
  },
];

export default function HowWeTestPage() {
  return (
    <div>
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-4xl px-6 py-20 lg:px-10">
          <p className="text-xs uppercase tracking-[0.35em] text-gold">Verification</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-white lg:text-5xl">
            How We Test
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/60">
            Every claim VeriCert makes about a compound is traceable to a
            document produced by someone other than us. This page explains
            exactly how that works — the process, the instruments, and how to
            read the certificate that comes with your order.
          </p>
        </div>
      </section>

      {/* The process */}
      <section className="mx-auto max-w-5xl px-6 py-20 lg:px-10">
        <h2 className="font-serif text-3xl text-white">From Lot to Certificate</h2>
        <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-2">
          {STAGES.map((stage) => (
            <div key={stage.step} className="border-t border-white/10 pt-6">
              <p className="font-mono text-xs text-gold">{stage.step}</p>
              <h3 className="mt-2 font-serif text-xl text-white">{stage.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/55">{stage.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Reading a certificate */}
      <section className="texture-diagonal border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-5xl px-6 py-20 lg:px-10">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <VialGlyph className="h-12 w-12 shrink-0 text-gold" />
            <div>
              <h2 className="font-serif text-3xl text-white">Reading a Certificate</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/50">
                A COA is only useful if you know what each line is telling you.
              </p>
            </div>
          </div>

          <dl className="mt-12 divide-y divide-white/10 border-y border-white/10">
            {COA_FIELDS.map((row) => (
              <div key={row.field} className="grid grid-cols-1 gap-2 py-5 sm:grid-cols-[220px_1fr] sm:gap-8">
                <dt className="text-sm uppercase tracking-[0.12em] text-gold">{row.field}</dt>
                <dd className="text-sm leading-relaxed text-white/60">{row.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Check yours */}
      <section className="mx-auto max-w-4xl px-6 py-20 lg:px-10">
        <h2 className="font-serif text-3xl text-white">Check Your Batch</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
          Enter the batch number from your vial label. You&apos;ll get the same
          report we hold on file — no account required, and it works whether you
          bought yesterday or two years ago.
        </p>
        <div className="mt-8">
          <CoaQuickLookup />
        </div>

        <div className="mt-16 border-t border-white/10 pt-10">
          <h3 className="font-serif text-xl text-white">Still have a question?</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/55">
            If a figure on your certificate doesn&apos;t look right, or the batch
            number won&apos;t resolve, tell us and we will look into it directly.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              href="/contact"
              className="border border-gold px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-gold transition-colors hover:bg-gold hover:text-black"
            >
              Contact Us
            </Link>
            <Link
              href="/faq"
              className="border border-white/20 px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-white/70 transition-colors hover:border-gold hover:text-gold"
            >
              Read the FAQ
            </Link>
            <Link
              href="/shop"
              className="border border-white/20 px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-white/70 transition-colors hover:border-gold hover:text-gold"
            >
              Browse the Catalog
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
