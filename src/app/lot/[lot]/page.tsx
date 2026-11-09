import type { Metadata } from "next";
import Link from "next/link";
import { CertificateActions } from "@/components/verify/CertificateActions";
import { publicCertificatesForLot } from "@/lib/coa/public";
import { LOT_AVAILABILITY_LABELS } from "@/lib/coa/types";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

// The permanent page for one VeriCert lot: vericertpeptides.com/lot/<lot number>. Built for the QR code on each
// vial — scanning lands here with no further search. It shows the lot's published certificate(s) and their actions,
// and keeps working after the lot sells out (historical lots stay published; nothing expires after 12 months).
// Only approved, published, non-test certificates appear; anything else reads as "no published certificate".

type Props = { params: Promise<{ lot: string }> };

const decode = (raw: string) => {
  try {
    return decodeURIComponent(raw).trim().slice(0, 80);
  } catch {
    return raw.slice(0, 80);
  }
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lot = decode((await params).lot);
  const certs = await publicCertificatesForLot(lot);
  return {
    title: certs.length ? `Lot ${lot} — ${certs[0].compoundName} Certificate of Analysis | VeriCert` : `Lot ${lot} | VeriCert`,
    alternates: { canonical: `${getSiteUrl()}/lot/${encodeURIComponent(lot)}` },
    robots: certs.length ? undefined : { index: false, follow: true },
  };
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export default async function LotPage({ params }: Props) {
  const lot = decode((await params).lot);
  const certs = await publicCertificatesForLot(lot);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 lg:px-10">
      <p className="text-xs uppercase tracking-[0.3em] text-gold-ink">Certificate of Analysis</p>
      <h1 className="mt-3 font-serif text-3xl text-navy sm:text-4xl">
        Lot <span className="font-mono">{lot}</span>
      </h1>

      {certs.length === 0 ? (
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted">
          <p>No certificate has been published for this lot number. Certificates are published as each lot is released.</p>
          <p>
            Questions about a lot?{" "}
            <Link href="/contact" className="text-navy underline underline-offset-2">Contact us</Link>.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {certs.map((cert) => (
            <article key={cert.id} className="border-t border-hairline pt-6">
              <h2 className="font-serif text-2xl text-navy">
                {cert.compoundName}
                {cert.sizeLabel && <span className="text-muted"> · {cert.sizeLabel}</span>}
              </h2>
              <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-[200px_1fr]">
                <dt className="text-xs uppercase tracking-[0.12em] text-gold-ink">VeriCert Lot</dt>
                <dd className="font-mono text-navy">{cert.lotNumber}</dd>
                <dt className="text-xs uppercase tracking-[0.12em] text-gold-ink">Laboratory</dt>
                <dd className="text-navy">{cert.laboratoryName ?? "—"}</dd>
                <dt className="text-xs uppercase tracking-[0.12em] text-gold-ink">Laboratory Report</dt>
                <dd className="font-mono text-navy">{cert.labReportId ?? "—"}</dd>
                <dt className="text-xs uppercase tracking-[0.12em] text-gold-ink">Date Tested</dt>
                <dd className="text-navy">{formatDate(cert.testedOn)}</dd>
                <dt className="text-xs uppercase tracking-[0.12em] text-gold-ink">Date Issued</dt>
                <dd className="text-navy">{formatDate(cert.issuedOn)}</dd>
                <dt className="text-xs uppercase tracking-[0.12em] text-gold-ink">Lot Status</dt>
                <dd className="text-navy">{LOT_AVAILABILITY_LABELS[cert.availability]}</dd>
              </dl>
              <p className="mt-5 text-xs leading-relaxed text-muted">
                Results are those reported on the laboratory&apos;s certificate; open it for every figure and method.
              </p>
              <div className="mt-5">
                <CertificateActions cert={cert} />
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="mt-12 text-sm text-muted">
        <Link href="/how-we-test" className="text-navy underline underline-offset-2">How we test</Link> — what each figure on a certificate means.
      </p>
    </div>
  );
}
