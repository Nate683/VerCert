import type { AcceptanceCriteria, CoaRecord, TestStatus } from "./types";

// Release specifications and how a certificate is judged against them. Pure; client-safe.
//
// Criteria are per product (a product slug), falling back to the default row '*'. For applicable peptide products
// the default is: chromatographic purity ≥ 99.0%, measured active peptide quantity 100–120% of the labeled strength.
// A product can be marked "not applicable" (applies = false), e.g. bacteriostatic water, and can list further
// required tests. Methods and criteria are never assumed uniform across compounds — that is why they are per product.
//
// A result that is missing is never a pass. A result that can't be read unambiguously is "requires review".

export function criteriaFor(slug: string | null, all: AcceptanceCriteria[]): AcceptanceCriteria | null {
  return (slug ? all.find((c) => c.productSlug === slug) : undefined) ?? all.find((c) => c.productSlug === "*") ?? null;
}

// The labeled strength in milligrams, from a size label like "10mg", "10 mg" or "5MG". Blends ("5mg / 5mg") and
// anything else return null: their quantity has to be judged by a person.
export function labeledStrengthMg(sizeLabel: string | null): number | null {
  if (!sizeLabel) return null;
  const m = sizeLabel.trim().match(/^(\d+(?:\.\d+)?)\s*mg$/i);
  return m ? Number(m[1]) : null;
}

// A number from a printed result: "99.62%", "99.62 %", "10.84 mg", "10.84mg". Returns null for anything that is
// not exactly one number with an optional unit (e.g. "> 99%", "99.1–99.4", "see attached"), so a range or a
// qualifier is never silently turned into a figure.
export function parseResultNumber(printed: string | null, unit: "%" | "mg"): number | null {
  if (!printed) return null;
  const re = unit === "%" ? /^\s*(\d{1,3}(?:\.\d+)?)\s*%?\s*$/ : /^\s*(\d+(?:\.\d+)?)\s*(?:mg)?\s*$/i;
  const m = printed.match(re);
  return m ? Number(m[1]) : null;
}

export type CriterionCheck = {
  key: "purity" | "quantity" | string;
  label: string;
  status: TestStatus;
  detail: string;
};

// How the certificate measures up. Every check has a status; nothing missing ever reads as passed.
export function evaluateCriteria(record: CoaRecord, criteria: AcceptanceCriteria | null): CriterionCheck[] {
  const checks: CriterionCheck[] = [];
  if (!criteria || !criteria.applies) return checks;

  if (criteria.minPurityPercent !== null) {
    const min = Number(criteria.minPurityPercent);
    if (record.purityResult === null) {
      checks.push({ key: "purity", label: "Chromatographic purity", status: "not_performed", detail: `No purity result on the certificate (required ≥ ${min}%).` });
    } else if (record.purityPercent === null) {
      checks.push({ key: "purity", label: "Chromatographic purity", status: "requires_review", detail: `"${record.purityResult}" isn't a single figure; check it against ≥ ${min}%.` });
    } else {
      const pass = record.purityPercent >= min;
      checks.push({ key: "purity", label: "Chromatographic purity", status: pass ? "passed" : "failed", detail: `${record.purityPercent}% against ≥ ${min}%.` });
    }
  }

  if (criteria.quantityMinPercent !== null || criteria.quantityMaxPercent !== null) {
    const lo = criteria.quantityMinPercent !== null ? Number(criteria.quantityMinPercent) : null;
    const hi = criteria.quantityMaxPercent !== null ? Number(criteria.quantityMaxPercent) : null;
    const range = `${lo ?? "—"}–${hi ?? "—"}% of labeled strength`;
    const labeled = labeledStrengthMg(record.sizeLabel);
    if (record.quantityResult === null) {
      checks.push({ key: "quantity", label: "Active peptide quantity", status: "not_performed", detail: `No quantity result on the certificate (required ${range}).` });
    } else if (record.quantityMg === null) {
      checks.push({ key: "quantity", label: "Active peptide quantity", status: "requires_review", detail: `"${record.quantityResult}" isn't a single figure in mg; check it against ${range}.` });
    } else if (labeled === null) {
      checks.push({ key: "quantity", label: "Active peptide quantity", status: "requires_review", detail: `Labeled strength can't be read from "${record.sizeLabel ?? "no size"}"; check ${record.quantityMg} mg by hand.` });
    } else {
      const pct = (record.quantityMg / labeled) * 100;
      const pass = (lo === null || pct >= lo) && (hi === null || pct <= hi);
      checks.push({ key: "quantity", label: "Active peptide quantity", status: pass ? "passed" : "failed", detail: `${record.quantityMg} mg = ${pct.toFixed(1)}% of ${labeled} mg (required ${range}).` });
    }
  }

  for (const key of criteria.requiredTests) {
    const t = record.testResults.find((r) => r.key === key);
    const label = t?.name ?? key;
    if (!t) checks.push({ key, label, status: "not_performed", detail: "Required for this product but not on the certificate." });
    else checks.push({ key, label, status: t.status, detail: t.result ? `Reported: ${t.result}` : "No result recorded." });
  }
  return checks;
}
