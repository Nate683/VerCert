import type { PublicCertificate } from "@/lib/coa/types";

// The certificate actions, used everywhere a certificate is shown (search results and the permanent lot page).
// VIEW VERICERT COA opens the original laboratory PDF from our storage; VERIFY AT LAB opens the laboratory's own
// record for this certificate, in a new tab. When both exist they carry equal weight. "Verify at Lab" (not
// "…Laboratory") keeps the label on one line when the two buttons share the 384px search-results column (188px each).
//
// With a laboratory link, the report number and VeriCert lot are shown exactly as stored on our record (whitespace
// preserved, nothing reformatted) with a note telling the visitor how to check it at the laboratory. The note never
// says VeriCert confirmed the certificate: confirmation is the visitor's, at the laboratory. Without a link nothing
// about verification is shown.

const BUTTON =
  "inline-flex min-h-11 flex-1 basis-44 items-center justify-center border border-navy px-4 py-2.5 text-center text-xs font-medium uppercase tracking-[0.14em] text-navy transition-colors hover:bg-navy hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";

export function CertificateActions({
  cert,
}: {
  cert: Pick<PublicCertificate, "id" | "lotNumber" | "hasPdf" | "verificationUrl" | "laboratoryName" | "labReportId">;
}) {
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
            Verify at Lab
          </a>
        )}
      </div>
      {cert.hasPdf && (
        <div className="text-xs text-muted">
          <a href={`/api/verify/certificate/${cert.id}?download=1`} className="underline underline-offset-2 hover:text-navy">
            Download PDF
          </a>
        </div>
      )}
      {cert.verificationUrl && (
        <div className="mt-1 border-l-2 border-gold/60 pl-3 text-xs leading-relaxed text-muted">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
            {cert.labReportId && (
              <>
                <dt>Report number</dt>
                <dd className="whitespace-pre-wrap font-mono text-navy [overflow-wrap:anywhere]">{cert.labReportId}</dd>
              </>
            )}
            <dt>VeriCert lot</dt>
            <dd className="whitespace-pre-wrap font-mono text-navy [overflow-wrap:anywhere]">{cert.lotNumber}</dd>
          </dl>
          <p className="mt-1.5">
            {cert.laboratoryName ?? "The issuing laboratory"} is an independent laboratory, not part of VeriCert. To check
            this certificate, open the laboratory&apos;s own record and confirm that its report number matches the one
            above. The VeriCert lot number is assigned by VeriCert and may not appear on the laboratory&apos;s page.
          </p>
        </div>
      )}
    </div>
  );
}
