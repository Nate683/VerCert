"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { CertificateGroup, PublicLot, PublicReport } from "@/lib/coa/types";
import { CertificateActions } from "./CertificateActions";

// THE customer-facing certificate results — one component for the header's VERIFY BEFORE YOU BUY, the Every Lot
// Certified search on /how-we-test, the permanent lot page, and the Executive Office's PREVIEW PUBLIC VIEW.
//
//   Product Name — Strength
//   CURRENT LOT  <lot>        its published reports, newest testing date first
//   HISTORICAL LOTS           older lots, newest first, each with its reports newest first
//
// Each report: laboratory, testing date, laboratory report number, original testing / retest where the dates support
// it, and the two verification actions. No analytical values (purity, quantity, …) — the customer reads the full
// report through VERIFY VERICERT COA and VERIFY WITH [LABORATORY].

function formatDate(d: string | null): string | null {
  if (!d) return null;
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function Report({ report }: { report: PublicReport }) {
  const tested = formatDate(report.testedOn);
  const issued = formatDate(report.issuedOn);
  return (
    <li className="border-t border-hairline py-4 first:border-t-0 first:pt-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm leading-relaxed">
          <dt className="text-muted">Laboratory</dt>
          <dd className="text-navy [overflow-wrap:anywhere]">{report.laboratoryName ?? "—"}</dd>
          <dt className="text-muted">{tested ? "Tested" : "Issued"}</dt>
          <dd className="text-navy">
            {tested ?? issued ?? "Not stated on the certificate"}
            {report.testing && (
              <span className="ml-2 inline-block border border-hairline px-1.5 py-px text-[10px] uppercase tracking-[0.12em] text-muted">
                {report.testing === "original" ? "Original testing" : "Retest"}
              </span>
            )}
          </dd>
          {report.labReportId && (
            <>
              <dt className="text-muted">Report no.</dt>
              <dd className="whitespace-pre-wrap tabular-nums text-navy [overflow-wrap:anywhere]">{report.labReportId}</dd>
            </>
          )}
        </dl>
        <div className="w-full md:w-auto md:max-w-[26rem] md:shrink-0">
          <CertificateActions report={report} />
        </div>
      </div>
    </li>
  );
}

function Lot({ lot, matched }: { lot: PublicLot; matched: boolean }) {
  return (
    <div className={matched ? "border-l-2 border-gold pl-3" : ""}>
      <p className="text-sm text-navy">
        Lot <span className="font-semibold tabular-nums [overflow-wrap:anywhere]">{lot.lotNumber}</span>
        {matched && <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-gold-ink">Matches your search</span>}
      </p>
      <ul className="mt-1">{lot.reports.map((r) => <Report key={r.id} report={r} />)}</ul>
    </div>
  );
}

export function CertificateResults({ groups }: { groups: CertificateGroup[] }) {
  return (
    <div className="space-y-8">
      {groups.map((g) => {
        const isMatched = (lot: PublicLot) => g.matchedLots.some((m) => m.trim().toUpperCase() === lot.lotNumber.trim().toUpperCase());
        return (
          <section key={g.key} aria-label={`${g.compoundName}${g.sizeLabel ? ` ${g.sizeLabel}` : ""}`}>
            {g.preview && (
              <p className="mb-3 border border-[#8a3b33]/40 bg-[#8a3b33]/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a3b33]">
                Preview — not public
              </p>
            )}
            <h3 className="font-serif text-xl text-navy">
              {g.compoundName}
              {g.sizeLabel && <span className="text-muted"> — {g.sizeLabel}</span>}
            </h3>
            {g.current && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-ink">Current lot</p>
                <div className="mt-2">
                  <Lot lot={g.current} matched={isMatched(g.current)} />
                </div>
              </div>
            )}
            {g.historical.length > 0 && (
              <div className="mt-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Historical lots</p>
                <div className="mt-2 space-y-5">
                  {g.historical.map((lot) => <Lot key={lot.lotNumber} lot={lot} matched={isMatched(lot)} />)}
                </div>
              </div>
            )}
          </section>
        );
      })}
      <p className="text-xs leading-relaxed text-muted">
        Each laboratory is independent of VeriCert. To check a certificate at its source, open the laboratory&apos;s record and
        confirm its report number matches the one shown here; the VeriCert lot number may not appear on the laboratory&apos;s page.{" "}
        <Link href="/how-we-test" className="underline underline-offset-2 hover:text-navy">How we test</Link>
      </p>
    </div>
  );
}

// The focused overlay the search opens: a modal dialog with focus moved into it and returned on close, Escape and the
// close button to dismiss, and the page behind it locked from scrolling.
export function CertificateResultsDialog({ title, groups, onClose }: { title: string; groups: CertificateGroup[]; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && dialog.current) {
        // Keep Tab inside the dialog.
        const f = [...dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/40 sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="certificate-results-title"
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col border border-hairline bg-paper shadow-[0_24px_60px_-20px_rgba(19,37,68,0.45)] sm:max-h-[85dvh]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-ink">Certificate of analysis</p>
            <h2 id="certificate-results-title" className="mt-1 text-base font-semibold text-navy [overflow-wrap:anywhere]">{title}</h2>
          </div>
          <button ref={closeBtn} type="button" onClick={onClose} className="min-h-11 shrink-0 px-2 text-xs uppercase tracking-[0.14em] text-muted transition-colors hover:text-navy">
            Close
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          <CertificateResults groups={groups} />
        </div>
      </div>
    </div>
  );
}
