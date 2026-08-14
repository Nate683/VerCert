import { CoaClient } from "./CoaClient";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "COA Verification | VeriCert",
  description: "Enter a batch number to view the independent certificate of analysis for your VeriCert product.",
  path: "/coa",
});

export default function CoaPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20 lg:px-10">
      <p className="text-xs uppercase tracking-[0.35em] text-gold">Verification</p>
      <h1 className="mt-3 font-serif text-4xl text-white">Certificate of Analysis</h1>
      <p className="mt-4 text-sm leading-relaxed text-white/50">
        Every batch VeriCert releases is independently tested. Enter the
        batch number printed on your vial label to retrieve its lab report.
      </p>
      <div className="mt-10">
        <CoaClient />
      </div>
    </div>
  );
}
