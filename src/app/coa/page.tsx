import { CoaClient } from "./CoaClient";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "COA Verification | VeriCert",
  description: "Certificates of analysis for VeriCert products, by lot number.",
  path: "/coa",
});

export default function CoaPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold-ink">Verification</p>
      <h1 className="mt-3 font-serif text-4xl text-navy">Certificate of Analysis</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Every lot VeriCert releases will be independently tested. Once
        certificates are published, you&apos;ll be able to enter the lot number
        printed on your vial label to retrieve its lab report.
      </p>
      <div className="mt-10">
        <CoaClient />
      </div>
    </div>
  );
}
