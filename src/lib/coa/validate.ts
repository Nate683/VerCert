import { criteriaFor, evaluateCriteria, type CriterionCheck } from "./criteria";
import { isUnreadableLabRecord } from "./lab-record-rules";
import type { AcceptanceCriteria, CoaRecord, Laboratory } from "./types";

// Everything that decides whether a certificate record may be approved. Pure; client-safe.
// Errors block approval. Warnings are shown to the administrator and don't block.

export type Issue = { level: "error" | "warning"; code: string; message: string };

export type ProductInfo = {
  slug: string;
  name: string;
  alternateNames: string[];
  sizes: string[];
  batchNumbers: string[];
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function validDate(d: string): boolean {
  if (!DATE.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}

export function validateRecord(
  record: CoaRecord,
  ctx: {
    product: ProductInfo | null;
    criteria: AcceptanceCriteria[];
    labs: Laboratory[];
    others: Pick<CoaRecord, "id" | "lotNumber" | "labReportId" | "approvalStatus">[];
    today: string; // YYYY-MM-DD
  }
): { issues: Issue[]; checks: CriterionCheck[] } {
  const issues: Issue[] = [];
  const err = (code: string, message: string) => issues.push({ level: "error", code, message });
  const warn = (code: string, message: string) => issues.push({ level: "warning", code, message });

  // Required fields.
  const required: [keyof CoaRecord, string][] = [
    ["lotNumber", "VeriCert lot number"],
    ["productSlug", "Product"],
    ["sizeLabel", "Strength"],
    ["laboratoryId", "Laboratory"],
    ["labReportId", "Laboratory report number"],
    ["issuedOn", "Issue date"],
    ["fileId", "Certificate PDF"],
  ];
  for (const [key, label] of required) {
    const v = record[key];
    if (v === null || v === undefined || (typeof v === "string" && !v.trim())) err(`missing_${key}`, `${label} is required.`);
  }
  if (!record.testedOn) warn("missing_testedOn", "No test date recorded. Leave it empty only if the certificate doesn't state one.");
  if (record.labReportId && record.lotNumber && norm(record.labReportId) === norm(record.lotNumber)) {
    warn("same_ids", "The laboratory report number is the same as the VeriCert lot number. They are normally different values — check both.");
  }

  // Dates.
  for (const [key, label] of [["testedOn", "Test date"], ["issuedOn", "Issue date"]] as const) {
    const v = record[key];
    if (!v) continue;
    if (!validDate(v)) err(`bad_${key}`, `${label} must be a real date (YYYY-MM-DD).`);
    else if (v > ctx.today) err(`future_${key}`, `${label} ${v} is in the future.`);
  }
  if (record.testedOn && record.issuedOn && validDate(record.testedOn) && validDate(record.issuedOn) && record.testedOn > record.issuedOn) {
    err("date_order", "The test date is after the issue date.");
  }
  if (record.dispositionOn && !validDate(record.dispositionOn)) err("bad_dispositionOn", "Final disposition date must be a real date (YYYY-MM-DD).");

  // Product, strength and lot association.
  const p = ctx.product;
  if (record.productSlug && !p) err("unknown_product", `No product "${record.productSlug}" in the catalog.`);
  if (p) {
    if (record.sizeLabel && !p.sizes.some((s) => norm(s) === norm(record.sizeLabel!))) {
      err("unknown_size", `${p.name} has no "${record.sizeLabel}" size (sizes: ${p.sizes.join(", ") || "none"}).`);
    }
    if (record.lotNumber && !p.batchNumbers.some((b) => norm(b) === norm(record.lotNumber))) {
      err("lot_not_in_catalog", `Lot ${record.lotNumber} isn't one of ${p.name}'s lots in the catalog (${p.batchNumbers.join(", ") || "none listed"}). Add it in Inventory, or correct the lot number.`);
    }
    // Compound and strength as printed on the certificate must match the product chosen.
    const printedCompound = record.extraction?.found.compoundName?.value;
    if (printedCompound) {
      const names = [p.name, ...p.alternateNames].map(norm).filter(Boolean);
      const printed = norm(printedCompound);
      if (!names.some((n) => printed.includes(n) || n.includes(printed))) {
        err("compound_mismatch", `The certificate names "${printedCompound}", which doesn't match ${p.name}${p.alternateNames.length ? ` (${p.alternateNames.join(", ")})` : ""}.`);
      }
    }
    const printedStrength = record.extraction?.found.strength?.value;
    if (printedStrength && record.sizeLabel && norm(printedStrength) !== norm(record.sizeLabel)) {
      err("strength_mismatch", `The certificate states strength "${printedStrength}", but the record is for ${record.sizeLabel}.`);
    }
  }
  if (record.inventoryLot && record.lotNumber && norm(record.inventoryLot) !== norm(record.lotNumber)) {
    err("inventory_lot_mismatch", `The record is linked to inventory lot ${record.inventoryLot}, not ${record.lotNumber}.`);
  }

  // Laboratory.
  if (record.laboratoryId && !ctx.labs.some((l) => l.id === record.laboratoryId)) err("unknown_lab", "The laboratory isn't on the laboratory list.");

  // Duplicates.
  for (const o of ctx.others) {
    if (o.id === record.id || !record.lotNumber || norm(o.lotNumber) !== norm(record.lotNumber)) continue;
    if (norm(o.labReportId ?? "") === norm(record.labReportId ?? "")) err("duplicate", `Another record already holds lot ${record.lotNumber} with this laboratory report number.`);
    else warn("other_certificate", `Lot ${record.lotNumber} has another certificate (report ${o.labReportId ?? "—"}, ${o.approvalStatus}). Fine for a retest — check it's intended.`);
  }

  // Specification.
  const checks = evaluateCriteria(record, criteriaFor(record.productSlug, ctx.criteria));
  for (const c of checks) {
    if (c.status === "failed") err(`oos_${c.key}`, `Out of specification — ${c.label}: ${c.detail}`);
    else if (c.status === "not_performed") err(`missing_test_${c.key}`, `Missing — ${c.label}: ${c.detail}`);
    else if (c.status !== "passed") err(`review_${c.key}`, `${c.label} needs a decision: ${c.detail}`);
  }
  for (const t of record.testResults) {
    if (checks.some((c) => c.key === t.key)) continue;
    if (t.status === "failed") err(`test_failed_${t.key}`, `${t.name} failed${t.result ? `: ${t.result}` : ""}.`);
    else if (t.status === "requires_review" || t.status === "pending") err(`test_open_${t.key}`, `${t.name} is "${t.status.replace("_", " ")}". Set its status from the certificate before approving.`);
  }

  // Verification link. A link the automatic check can't read (a Vanguard per-certificate record that loads but is
  // rendered in the browser — every condition in lib/coa/lab-record-rules.ts) doesn't block approval: the approver
  // opens it and compares. Every other link must have been checked and marked valid.
  if (record.verificationUrl && record.verificationStatus !== "valid" && isUnreadableLabRecord(record, ctx.labs)) {
    warn("verification_link_manual", `The laboratory's page can't be read automatically. Open the link and confirm it shows report ${record.labReportId ?? "—"} before approving.`);
  } else if (record.verificationUrl && record.verificationStatus !== "valid") {
    err("verification_link", `The laboratory verification link is ${record.verificationStatus === "invalid" ? "invalid" : "not checked yet"}${record.verificationNote ? `: ${record.verificationNote}` : ""}. Check it, or remove it so the site says online verification is unavailable.`);
  }

  // Extraction findings the administrator should see.
  for (const r of record.extraction?.rejected ?? []) warn("extraction_rejected", `Extraction proposed ${r.field} "${r.value}" but it was discarded: ${r.reason}`);
  if (record.extraction && record.extraction.missing.length) warn("extraction_missing", `Not found in the PDF (left empty): ${record.extraction.missing.join(", ")}.`);

  if (record.reviewStatus !== "reviewed") err("not_reviewed", "Review every field against the PDF, then mark the record reviewed.");
  return { issues, checks };
}
