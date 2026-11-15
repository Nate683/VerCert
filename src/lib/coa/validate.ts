import { criteriaFor, evaluateCriteria, type CriterionCheck } from "./criteria";
import { isUnreadableLabRecord } from "./lab-record-rules";
import { checkVerificationUrl } from "./verification-url";
import type { AcceptanceCriteria, AcknowledgedWarning, CoaRecord, Laboratory } from "./types";

// What stands between a certificate record and approval/publication. Pure; client-safe.
//
// Three levels (owner decision D1, 2026-11-14 — the owner controls publication; quality scoring never decides it):
// - error:    a hard requirement. Blocks approval and publication. Only identity, the original PDF, the laboratory
//             link and its manual confirmation, real dates, duplicates and test data are hard requirements.
// - advisory: a quality or consistency finding (failed/missing tests, out-of-specification results, a lot not yet in
//             inventory, printed name or strength differing from the chosen product). Never blocks by itself: the
//             owner must ACKNOWLEDGE it (recorded with who and when), and then may approve and publish.
// - warning:  information only (extraction notes, automated link-check results, availability mismatch, retests).

export type IssueLevel = "error" | "advisory" | "warning";
export type Issue = { level: IssueLevel; code: string; message: string };

export type ProductInfo = {
  slug: string;
  name: string;
  alternateNames: string[];
  sizes: string[];
  batchNumbers: string[];
  // Read-only, for the informational availability warning. Never changed by the certificate system.
  availabilityStatus?: string;
  // The same per strength label (Stage 1: status is per strength). The warning uses the record's own strength.
  sizeStatuses?: Record<string, string>;
  active?: boolean;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function validDate(d: string): boolean {
  if (!DATE.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}

// A person opened the laboratory link and confirmed it shows this report — for the link and report number as they are
// NOW. Changing either after confirmation makes this false, so it must be confirmed again.
export function linkConfirmed(r: Pick<CoaRecord, "verificationUrl" | "labReportId" | "linkConfirmedUrl" | "linkConfirmedAt" | "linkConfirmedReportId">): boolean {
  return Boolean(
    r.verificationUrl && r.linkConfirmedAt && r.linkConfirmedUrl === r.verificationUrl && (r.linkConfirmedReportId ?? "") === (r.labReportId ?? "")
  );
}

// Every advisory finding has an acknowledgment with the same code AND the same wording (so a changed finding — a
// different purity figure, a different failed test — needs a fresh acknowledgment).
export function unacknowledged(issues: Issue[], acknowledged: AcknowledgedWarning[]): Issue[] {
  return issues.filter((i) => i.level === "advisory" && !acknowledged.some((a) => a.code === i.code && a.message === i.message));
}

export function validateRecord(
  record: CoaRecord,
  ctx: {
    product: ProductInfo | null;
    criteria: AcceptanceCriteria[];
    labs: Laboratory[];
    others: Pick<CoaRecord, "id" | "lotNumber" | "labReportId" | "approvalStatus" | "productSlug" | "sizeLabel" | "deletedAt" | "publicVisibility">[];
    today: string; // YYYY-MM-DD
  }
): { issues: Issue[]; checks: CriterionCheck[] } {
  const issues: Issue[] = [];
  const err = (code: string, message: string) => issues.push({ level: "error", code, message });
  const advise = (code: string, message: string) => issues.push({ level: "advisory", code, message });
  const warn = (code: string, message: string) => issues.push({ level: "warning", code, message });

  // Required fields (hard). The issue date is advisory: the certificate may genuinely not print one.
  const required: [keyof CoaRecord, string][] = [
    ["lotNumber", "VeriCert lot number"],
    ["productSlug", "Product"],
    ["sizeLabel", "Strength"],
    ["laboratoryId", "Laboratory"],
    ["labReportId", "Laboratory report number"],
    ["fileId", "Original laboratory PDF"],
    ["verificationUrl", "Laboratory verification link"],
  ];
  for (const [key, label] of required) {
    const v = record[key];
    if (v === null || v === undefined || (typeof v === "string" && !v.trim())) err(`missing_${key}`, `${label} is required.`);
  }
  if (!record.issuedOn) advise("missing_issuedOn", "No issue date recorded. Leave it empty only if the certificate doesn't print one.");
  if (!record.testedOn) warn("missing_testedOn", "No test date recorded. Leave it empty only if the certificate doesn't state one.");
  if (record.labReportId && record.lotNumber && norm(record.labReportId) === norm(record.lotNumber)) {
    warn("same_ids", "The laboratory report number is the same as the VeriCert lot number. They are normally different values — check both.");
  }
  if (record.isTest) err("test_record", "This is a synthetic test record. Test records can be previewed but never published.");

  // Dates: a date that is entered must be real and consistent (hard).
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

  // Product, strength and lot association. The product and strength must exist (hard); whether inventory already
  // lists the lot, and whether the printed name/strength agree with the choice, are advisory.
  const p = ctx.product;
  if (record.productSlug && !p) err("unknown_product", `No product "${record.productSlug}" in the catalog.`);
  if (p) {
    if (record.sizeLabel && !p.sizes.some((s) => norm(s) === norm(record.sizeLabel!))) {
      err("unknown_size", `${p.name} has no "${record.sizeLabel}" size (sizes: ${p.sizes.join(", ") || "none"}).`);
    }
    if (record.lotNumber && !p.batchNumbers.some((b) => norm(b) === norm(record.lotNumber))) {
      advise("lot_not_in_catalog", `Lot ${record.lotNumber} isn't one of ${p.name}'s lots in inventory (${p.batchNumbers.join(", ") || "none listed"}). Publishing doesn't need it; add it in Inventory if this lot is being sold.`);
    }
    const printedCompound = record.extraction?.found.compoundName?.value;
    if (printedCompound) {
      const names = [p.name, ...p.alternateNames].map(norm).filter(Boolean);
      const printed = norm(printedCompound);
      if (!names.some((n) => printed.includes(n) || n.includes(printed))) {
        advise("compound_mismatch", `The certificate names "${printedCompound}", which doesn't match ${p.name}${p.alternateNames.length ? ` (${p.alternateNames.join(", ")})` : ""}. Check the product association.`);
      }
    }
    const printedStrength = record.extraction?.found.strength?.value;
    if (printedStrength && record.sizeLabel && norm(printedStrength) !== norm(record.sizeLabel)) {
      advise("strength_mismatch", `The certificate states strength "${printedStrength}", but the record is for ${record.sizeLabel}. Check the strength association.`);
    }
    // Informational: publishing never changes availability, and availability never blocks publishing.
    const shownStatus = (record.sizeLabel && p.sizeStatuses?.[record.sizeLabel]) || p.availabilityStatus;
    if (shownStatus && shownStatus !== "in_stock") {
      const label = { coming_soon: "Coming Soon", pending_testing: "In Independent Testing", out_of_stock: "Out of Stock" }[shownStatus] ?? shownStatus;
      const what = record.sizeLabel && p.sizeStatuses?.[record.sizeLabel] ? `${p.name} ${record.sizeLabel}` : p.name;
      warn("availability_mismatch", `${what} is currently ${label}. Publishing this certificate won't change that, and won't make it purchasable.`);
    }
    if (p.active === false) warn("product_hidden", `${p.name} is hidden from the storefront. A published certificate stays searchable regardless.`);
  }
  if (record.inventoryLot && record.lotNumber && norm(record.inventoryLot) !== norm(record.lotNumber)) {
    advise("inventory_lot_mismatch", `The record is linked to inventory lot ${record.inventoryLot}, not ${record.lotNumber}.`);
  }

  // Laboratory.
  if (record.laboratoryId && !ctx.labs.some((l) => l.id === record.laboratoryId)) err("unknown_lab", "The laboratory isn't on the laboratory list.");

  // Other records under the same lot: an identical report number is a duplicate (hard); a different report is a
  // legitimate retest (information); a different product or strength under the same lot is a conflict to fix
  // (advisory — the owner decides which is right).
  for (const o of ctx.others) {
    if (o.id === record.id || o.deletedAt || !record.lotNumber || norm(o.lotNumber) !== norm(record.lotNumber)) continue;
    if (norm(o.labReportId ?? "") === norm(record.labReportId ?? "")) err("duplicate", `Another record already holds lot ${record.lotNumber} with this laboratory report number. If this is a corrected report, use Upload Corrected PDF on that record instead.`);
    else warn("other_certificate", `Lot ${record.lotNumber} has another report (${o.labReportId ?? "—"}, ${o.publicVisibility === "public" ? "published" : o.approvalStatus}). A retest of the same lot is normal.`);
    if ((o.productSlug && record.productSlug && o.productSlug !== record.productSlug) || (o.sizeLabel && record.sizeLabel && norm(o.sizeLabel) !== norm(record.sizeLabel))) {
      advise("lot_association_conflict", `Lot ${record.lotNumber} is also recorded for ${o.productSlug ?? "?"} ${o.sizeLabel ?? ""} — one lot number should belong to one product and strength. Correct whichever is wrong.`);
    }
  }

  // Specification (the acceptance criteria): every finding is advisory — it flags, it never decides.
  const checks = evaluateCriteria(record, criteriaFor(record.productSlug, ctx.criteria));
  for (const c of checks) {
    if (c.status === "failed") advise(`oos_${c.key}`, `Out of specification — ${c.label}: ${c.detail}`);
    else if (c.status === "not_performed") advise(`missing_test_${c.key}`, `Missing — ${c.label}: ${c.detail}`);
    else if (c.status !== "passed") advise(`review_${c.key}`, `${c.label} needs a decision: ${c.detail}`);
  }
  for (const t of record.testResults) {
    if (checks.some((c) => c.key === t.key)) continue;
    if (t.status === "failed") advise(`test_failed_${t.key}`, `${t.name} failed${t.result ? `: ${t.result}` : ""}.`);
    else if (t.status === "requires_review" || t.status === "pending") advise(`test_open_${t.key}`, `${t.name} is "${t.status.replace("_", " ")}".`);
  }

  // Laboratory verification link. Hard: it exists, passes the address rules (https, a host recorded for this
  // laboratory, a specific record page — lib/coa/verification-url.ts, the allowlist), and a person confirmed it shows
  // this report. The automatic page check is information only: a page the server can't read is not an invalid link.
  if (record.verificationUrl) {
    const lab = ctx.labs.find((l) => l.id === record.laboratoryId) ?? null;
    const structural = checkVerificationUrl(record.verificationUrl, lab, record);
    if (!structural.ok) err("verification_link_address", `The laboratory verification link can't be used: ${structural.reason}`);
    else if (!linkConfirmed(record)) {
      err("link_not_confirmed", record.linkConfirmedAt
        ? "The link or report number changed after it was confirmed. Open the laboratory link and confirm it again."
        : "Open the laboratory link and confirm it shows this report (Confirm Laboratory Link).");
    }
    if (record.verificationStatus === "invalid" && structural.ok) {
      const unreadable = isUnreadableLabRecord(record, ctx.labs) || /doesn't show this certificate's report or lot number/.test(record.verificationNote ?? "");
      warn("link_check_result", unreadable
        ? "The laboratory's page couldn't be read automatically (it builds its content in the browser). That doesn't make the link invalid — open it and confirm it by eye."
        : `Automatic link check: ${(record.verificationNote ?? "it didn't pass").replace(/\.\s*$/, "")}. Open the link to see what it shows before confirming.`);
    } else if (record.verificationStatus === "valid") {
      warn("link_check_result", "Automatic link check: the page loads on the laboratory's site and identifies this report.");
    }
  }

  // Extraction findings the administrator should see.
  for (const r of record.extraction?.rejected ?? []) warn("extraction_rejected", `Extraction proposed ${r.field} "${r.value}" but it was discarded: ${r.reason}`);
  if (record.extraction && record.extraction.missing.length) warn("extraction_missing", `Not found in the PDF (left empty): ${record.extraction.missing.join(", ")}.`);

  if (record.reviewStatus !== "reviewed") err("not_reviewed", "Review every field against the PDF, then mark the record reviewed.");
  return { issues, checks };
}
