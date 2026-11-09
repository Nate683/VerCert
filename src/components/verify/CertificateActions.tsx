import type { PublicCertificate } from "@/lib/coa/types";

// The two certificate actions, used everywhere a certificate is shown (search results and the permanent lot page).
// VIEW VERICERT COA opens the original laboratory PDF from our storage; VERIFY AT LABORATORY opens the laboratory's
// own record for this certificate, in a new tab. When no validated laboratory record exists the site says so in
// plain words instead of showing a button. When both exist they carry equal weight.

const BUTTON =
  "inline-flex min-h-11 flex-1 basis-44 items-center justify-center border border-navy px-4 py-2.5 text-center text-xs font-medium uppercase tracking-[0.14em] text-navy transition-colors hover:bg-navy hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

export function CertificateActions({ cert }: { cert: Pick<PublicCertificate, "id" | "lotNumber" | "hasPdf" | "verificationUrl" | "laboratoryName"> }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {cert.hasPdf && (
          <a href={`/api/verify/certificate/${cert.id}`} target="_blank" rel="noopener" className={BUTTON}>
            View VeriCert COA
          </a>
        )}
        {cert.verificationUrl && (
          <a href={cert.verificationUrl} target="_blank" rel="noopener noreferrer" className={BUTTON}>
            Verify at Laboratory
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted">
        {cert.hasPdf && (
          <a href={`/api/verify/certificate/${cert.id}?download=1`} className="underline underline-offset-2 hover:text-navy">
            Download PDF
          </a>
        )}
        {!cert.verificationUrl && (
          <span>Independent online verification is unavailable for this lot.</span>
        )}
      </div>
    </div>
  );
}
