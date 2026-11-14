import type { CoaLot } from "./types";

// Current and historical lots for one product + strength, and the order of reports within a lot. Pure; client-safe.
//
// Rules (owner specification §6–7):
// - Lots are ordered by when the lot number was FIRST uploaded (coa_lots.first_uploaded_at — immutable). Editing,
//   retesting, unpublishing and republishing never make a lot newer.
// - Only published reports count (the caller passes published reports only — or, for an administrative preview, the
//   published set plus the record being previewed). A draft, synthetic or deleted report therefore can't displace the
//   current lot; when the current lot loses its last published report, the next lot becomes current automatically.
// - The newest lot with at least one published report is CURRENT; the rest are HISTORICAL, newest first.
// - Within a lot, reports are newest testing date first; ties and missing dates fall back to the issue date, then the
//   laboratory report number, then the record id — deterministic, never an invented date.
// - Inventory, availability and catalog visibility play no part.

export type ChronoReport = {
  id: string;
  lotNumber: string;
  testedOn: string | null;
  issuedOn: string | null;
  labReportId: string | null;
  createdAt: string;
};

export type LotGroup<R> = { lotNumber: string; firstUploadedAt: string; reports: (R & { testing: "original" | "retest" | null })[] };

export const lotKey = (lot: string) => lot.trim().toUpperCase();

const desc = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");

export function orderReports<R extends ChronoReport>(reports: R[]): (R & { testing: "original" | "retest" | null })[] {
  const sorted = [...reports].sort(
    (a, b) =>
      desc(a.testedOn ?? a.issuedOn, b.testedOn ?? b.issuedOn) ||
      desc(a.issuedOn, b.issuedOn) ||
      (a.labReportId ?? "").localeCompare(b.labReportId ?? "") ||
      a.id.localeCompare(b.id)
  );
  // "Original testing" / "Retest" only where the dates support it: two or more reports, each with a date, and the
  // oldest date unique.
  const dated = sorted.map((r) => r.testedOn ?? r.issuedOn);
  const canLabel = sorted.length > 1 && dated.every(Boolean) && dated.filter((d) => d === dated[dated.length - 1]).length === 1;
  return sorted.map((r, i) => ({ ...r, testing: canLabel ? (i === sorted.length - 1 ? "original" : "retest") : null }));
}

export function groupLots<R extends ChronoReport>(reports: R[], lots: CoaLot[]): { current: LotGroup<R> | null; historical: LotGroup<R>[] } {
  const byLot = new Map<string, R[]>();
  for (const r of reports) {
    const k = lotKey(r.lotNumber);
    byLot.set(k, [...(byLot.get(k) ?? []), r]);
  }
  const known = new Map(lots.map((l) => [l.lotKey, l]));
  const groups: LotGroup<R>[] = [...byLot.entries()].map(([k, rs]) => ({
    lotNumber: known.get(k)?.lotNumber ?? rs[0].lotNumber,
    // A lot with no chronology row (shouldn't happen after the migration) falls back to its earliest record upload.
    firstUploadedAt: known.get(k)?.firstUploadedAt ?? rs.map((r) => r.createdAt).sort()[0],
    reports: orderReports(rs),
  }));
  groups.sort((a, b) => b.firstUploadedAt.localeCompare(a.firstUploadedAt) || a.lotNumber.localeCompare(b.lotNumber));
  return { current: groups[0] ?? null, historical: groups.slice(1) };
}
