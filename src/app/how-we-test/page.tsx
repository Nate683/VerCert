import Image from "next/image";
import Link from "next/link";
import { VialGlyph } from "@/components/VialGlyph";
import { EveryLotCertified } from "@/components/verify/EveryLotCertified";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "How We Test | VeriCert",
  description:
    "How VeriCert will verify every batch: independent HPLC and mass spectrometry analysis, and what each figure on a certificate of analysis means.",
  path: "/how-we-test",
});

// Owner's wording, November 2026 — exactly six steps.
const STAGES = [
  {
    step: "01",
    title: "Receipt & Identification",
    body: "Upon arrival, each shipment is inspected, documented, and assigned a unique VeriCert lot number. Inventory remains quarantined pending independent laboratory testing and review.",
  },
  {
    step: "02",
    title: "Random Sample Selection",
    body: "VeriCert independently selects sample vials at random from each received lot. The selection process is documented to maintain traceability between the received inventory and the samples submitted for analysis.",
  },
  {
    step: "03",
    title: "Independent Laboratory Analysis",
    body: "Selected samples are submitted to an independent, accredited laboratory for analytical testing. Testing evaluates compound identity, purity, quantity, and applicable quality parameters under VeriCert's established specifications.",
  },
  {
    step: "04",
    title: "Quality Review",
    body: "VeriCert reviews the independent laboratory results against its established acceptance criteria, including the minimum 99.0% chromatographic purity requirement for applicable peptide products.",
  },
  {
    step: "05",
    title: "Release or Reject",
    body: "Lots that fail to meet any required specification are rejected and are not released for sale. Only lots that satisfy all applicable requirements are approved for inventory release.",
  },
  {
    step: "06",
    title: "Certificate & Traceability",
    body: "Each approved lot is linked to its laboratory-issued Certificate of Analysis (COA). Customers can access the laboratory documentation and independently verify the certificate through the issuing laboratory's verification system, where available.",
  },
];

// The eight certificate categories, in the owner's order. Copy for each comes from the owner's specification
// document. A row whose approved copy hasn't been supplied yet (meaning: null) is not rendered — the site never
// shows placeholder or invented copy. ACTIVE PEPTIDE QUANTITY and ADDITIONAL QUALITY TESTING are waiting for theirs;
// the other six keep the wording the page already had until the approved copy replaces it.
const COA_FIELDS: { field: string; meaning: string | null }[] = [
  {
    field: "Lot Number",
    meaning: "The specific production lot. It appears on your vial label and is the key to everything below.",
  },
  {
    field: "Purity (%)",
    meaning: "The proportion of the sample that is the target compound, by HPLC peak area. 99.0% and above is our release specification.",
  },
  { field: "Active Peptide Quantity (mg)", meaning: null },
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
    meaning: "The physical description of the material as received — color, form, and condition of the lyophilized cake or powder.",
  },
  { field: "Additional Quality Testing", meaning: null },
];

export default function HowWeTestPage() {
  return (
    <div>
      {/* how-we-test-backdrop.webp (2170 × 725), served as uploaded: no resizing or re-encoding. The wording,
          type and layout are unchanged; only the text colours change for contrast on the dark photograph. */}
      <section className="relative isolate overflow-hidden border-b border-hairline bg-navy-deep">
        <Image
          src="/how-we-test-backdrop.webp"
          alt=""
          fill
          priority
          unoptimized
          sizes="100vw"
          className="-z-10 object-cover object-center"
        />
        <div className="mx-auto max-w-4xl px-6 py-20 lg:px-10">
          <p className="text-xs uppercase tracking-[0.35em] text-[#b08c50]">Verification</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-white lg:text-5xl">
            How We Test
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/85">
            Every claim VeriCert makes about a compound will be traceable to a
            document produced by someone other than us. This page explains
            exactly how that will work — the process, the instruments, and how to
            read the certificate that will come with your order.
          </p>
        </div>
      </section>

      {/* The process */}
      <section className="mx-auto max-w-5xl px-6 py-20 lg:px-10">
        <h2 className="font-serif text-3xl text-navy">From Lot to Certificate</h2>
        <div className="mt-12 grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-2">
          {STAGES.map((stage) => (
            <div key={stage.step} className="border-t border-hairline pt-6">
              <p className="font-mono text-xs text-gold-ink">{stage.step}</p>
              <h3 className="mt-2 font-serif text-xl text-navy">{stage.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted">{stage.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Reading a certificate */}
      <section className="texture-diagonal border-y border-hairline bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-20 lg:px-10">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <VialGlyph className="h-12 w-12 shrink-0 text-gold-ink" />
            <div>
              <h2 className="font-serif text-3xl text-navy">Reading a Certificate</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                A COA is only useful if you know what each line is telling you.
              </p>
            </div>
          </div>

          <dl className="mt-12 divide-y divide-hairline border-y border-hairline">
            {COA_FIELDS.filter((row) => row.meaning !== null).map((row) => (
              <div key={row.field} className="grid grid-cols-1 gap-2 py-5 sm:grid-cols-[220px_1fr] sm:gap-8">
                <dt className="text-sm uppercase tracking-[0.12em] text-gold-ink">{row.field}</dt>
                <dd className="text-sm leading-relaxed text-muted">{row.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Every Lot Certified: banner, with the certificate search beneath it. */}
      <EveryLotCertified />

      {/* Kept close under the certificate search (whose suggestions and results open in the flow above it and push
          this down rather than overlap it). */}
      <section className="mx-auto max-w-4xl px-6 pb-12 pt-6 sm:pb-14 sm:pt-8 lg:px-10">
        <div>
          <h3 className="font-serif text-xl text-navy">Still have a question?</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            If a figure on your certificate doesn&apos;t look right, or the lot
            number won&apos;t resolve, tell us and we will look into it directly.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <Link
              href="/contact"
              className="border border-gold px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-gold-ink transition-colors hover:bg-gold hover:text-black"
            >
              Contact Us
            </Link>
            <Link
              href="/faq"
              className="border border-hairline px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:border-gold hover:text-gold-ink"
            >
              Read the FAQ
            </Link>
            <Link
              href="/shop"
              className="border border-hairline px-6 py-2.5 text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:border-gold hover:text-gold-ink"
            >
              Browse the Catalog
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
