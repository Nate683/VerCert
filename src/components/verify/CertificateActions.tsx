import type { PublicReport } from "@/lib/coa/types";

// The two verification actions on every published report, wherever one is shown (search results, the permanent lot
// page, and the administrative preview — the same component everywhere):
//   VERIFY VERICERT COA      — the original laboratory PDF as uploaded, served by VeriCert. Navy, document-check icon.
//   VERIFY WITH [LABORATORY] — the exact stored laboratory URL, which an administrator opened and confirmed shows this
//                              report. Gold, shield-check icon. The laboratory's own name, never a hard-coded one.
// Both open in a new tab. The laboratory link carries noopener + noreferrer.

const BASE =
  "inline-flex min-h-11 flex-1 basis-52 items-center justify-center gap-2 border px-4 py-2.5 text-center text-xs font-medium uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";

function DocumentCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function CertificateActions({ report }: { report: Pick<PublicReport, "pdfUrl" | "verificationUrl" | "laboratoryName"> }) {
  const lab = report.laboratoryName ?? "the laboratory";
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={report.pdfUrl}
        target="_blank"
        rel="noopener"
        className={`${BASE} border-navy bg-navy text-white hover:bg-transparent hover:text-navy focus-visible:outline-navy`}
      >
        <DocumentCheckIcon />
        Verify VeriCert COA
      </a>
      {report.verificationUrl && (
        <a
          href={report.verificationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BASE} border-gold-ink text-gold-ink hover:bg-gold hover:text-black focus-visible:outline-gold-ink`}
        >
          <ShieldCheckIcon />
          Verify with {lab}
        </a>
      )}
    </div>
  );
}
