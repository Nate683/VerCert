import type { Metadata } from "next";
import Link from "next/link";
import { CertificateResults } from "@/components/verify/CertificateResults";
import { publicGroupsForLot } from "@/lib/coa/public";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

// The permanent page for one VeriCert lot: vericertpeptides.com/lot/<lot number>. Built for the QR code on each vial —
// scanning lands here with no further search. It shows the product + strength this lot belongs to, in the same
// customer-facing layout as the search (current lot, historical lots, each report with its two verification actions),
// with this lot marked. It keeps working after the lot sells out: published lots don't expire. Only published,
// non-test, non-deleted certificates appear; anything else reads as "no published certificate", without saying
// whether any private record exists.

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
  const groups = await publicGroupsForLot(lot);
  return {
    title: groups.length ? `Lot ${lot} — ${groups[0].compoundName} Certificate of Analysis | VeriCert` : `Lot ${lot} | VeriCert`,
    alternates: { canonical: `${getSiteUrl()}/lot/${encodeURIComponent(lot)}` },
    robots: groups.length ? undefined : { index: false, follow: true },
  };
}

export default async function LotPage({ params }: Props) {
  const lot = decode((await params).lot);
  const groups = await publicGroupsForLot(lot);

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 lg:px-10">
      <p className="text-xs uppercase tracking-[0.3em] text-gold-ink">Certificate of Analysis</p>
      <h1 className="mt-3 font-serif text-3xl text-navy sm:text-4xl [overflow-wrap:anywhere]">Lot {lot}</h1>

      {groups.length === 0 ? (
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            No published certificate found for this lot number. Please verify the lot number printed on your vial. If the
            number is correct, contact VeriCert Peptides for assistance.
          </p>
          <p>
            <Link href="/contact" className="text-navy underline underline-offset-2">Contact us</Link>
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <CertificateResults groups={groups} />
        </div>
      )}

      <p className="mt-12 text-sm text-muted">
        <Link href="/how-we-test" className="text-navy underline underline-offset-2">How we test</Link> — what each figure on a certificate means.
      </p>
    </div>
  );
}
