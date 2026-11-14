import { listProducts } from "@/lib/products/store";
import { availabilityStatus } from "@/lib/products/availability";
import { logActivity } from "@/lib/activity-log";
import { parseResultNumber } from "./criteria";
import { extractCertificate, inspectPdf } from "./extract";
import {
  acknowledgeAlert,
  applyRevision,
  audit,
  createAlert,
  createRecord,
  discardRevision,
  ensureLot,
  findFileBySha,
  getFileMeta,
  getRecord,
  listAlerts,
  listCriteria,
  listLabs,
  listLots,
  listPendingRevisions,
  listRecords,
  openAlertFor,
  pendingRevision,
  replaceRecordFile,
  restoreRecord,
  savePendingRevision,
  sha256,
  softDeleteRecord,
  storeFile,
  updateRecord,
  type RecordPatch,
} from "./store";
import { checkLinkLive } from "./url-check";
import { checkVerificationUrl } from "./verification-url";
import { linkConfirmed, unacknowledged, validateRecord, type Issue, type ProductInfo } from "./validate";
import type { CriterionCheck } from "./criteria";
import { INVENTORY_STATUSES, TEST_STATUSES, type CoaLot, type CoaRecord, type CoaRevision, type InventoryAlert, type TestResult } from "./types";

// Server-only. The admin workflow for certificate records:
//   upload → extract → associate/correct (drafts save at any point) → review → open + CONFIRM the laboratory link →
//   acknowledge advisory warnings → approve → PUBLISH.
// Every step is audited with the acting account. Nothing here approves or publishes by itself: saving, reviewing,
// approving, passing every quality check — none of it makes a certificate public. Only the PUBLISH action does, and
// it never touches inventory, availability, catalog visibility or checkout.

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const today = () => new Date().toISOString().slice(0, 10);

export type AdminRecord = CoaRecord & {
  issues: Issue[];
  checks: CriterionCheck[];
  unacknowledged: Issue[];
  linkConfirmed: boolean;
  canApprove: boolean;
  canPublish: boolean;
  isPublished: boolean;
  lot: CoaLot | null;
  pendingRevision: (CoaRevision & { issues: Issue[]; unacknowledged: Issue[]; canPublish: boolean }) | null;
  openAlert: InventoryAlert | null;
  file: { fileName: string; sizeBytes: number; pageCount: number | null; sha256: string } | null;
};

async function context() {
  const [products, criteria, labs, records, lots] = await Promise.all([listProducts({ includeInactive: true }), listCriteria(), listLabs(), listRecords(), listLots()]);
  const productInfo: ProductInfo[] = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    alternateNames: p.alternateNames ?? [],
    sizes: p.sizes.map((s) => s.label),
    batchNumbers: p.batchNumbers,
    availabilityStatus: availabilityStatus(p),
    active: p.active !== false,
  }));
  return { products: productInfo, criteria, labs, records, lots };
}
type Ctx = Awaited<ReturnType<typeof context>>;

export const isPublished = (r: Pick<CoaRecord, "approvalStatus" | "publicVisibility" | "publishedAt" | "deletedAt">) =>
  r.approvalStatus === "approved" && r.publicVisibility === "public" && Boolean(r.publishedAt) && !r.deletedAt;

function evaluate(record: CoaRecord, ctx: Ctx) {
  return validateRecord(record, {
    product: ctx.products.find((p) => p.slug === record.productSlug) ?? null,
    criteria: ctx.criteria,
    labs: ctx.labs,
    others: ctx.records,
    today: today(),
  });
}

// The record as it would read once its pending revision is published.
function merged(record: CoaRecord, revision: CoaRevision): CoaRecord {
  return { ...record, ...(revision.patch as Partial<CoaRecord>), fileId: revision.fileId ?? record.fileId };
}

function withValidation(record: CoaRecord, ctx: Ctx, revision: CoaRevision | null, alert: InventoryAlert | null): Omit<AdminRecord, "file"> {
  const { issues, checks } = evaluate(record, ctx);
  const open = unacknowledged(issues, record.warningsAcknowledged);
  const noErrors = !issues.some((i) => i.level === "error");
  const published = isPublished(record);
  let pending: AdminRecord["pendingRevision"] = null;
  if (revision) {
    const m = merged(record, revision);
    const r = evaluate(m, ctx);
    const u = unacknowledged(r.issues, record.warningsAcknowledged);
    pending = { ...revision, issues: r.issues, unacknowledged: u, canPublish: published && !r.issues.some((i) => i.level === "error") && u.length === 0 };
  }
  return {
    ...record,
    issues,
    checks,
    unacknowledged: open,
    linkConfirmed: linkConfirmed(record),
    canApprove: record.approvalStatus === "pending" && !record.deletedAt && noErrors && open.length === 0,
    canPublish: record.approvalStatus === "approved" && !published && !record.deletedAt && !record.isTest && noErrors && open.length === 0,
    isPublished: published,
    lot: record.lotNumber ? ctx.lots.find((l) => l.lotKey === record.lotNumber!.trim().toUpperCase()) ?? null : null,
    pendingRevision: pending,
    openAlert: alert,
  };
}

export async function adminOverview() {
  const ctx = await context();
  const [revisions, alerts] = await Promise.all([listPendingRevisions(), listAlerts()]);
  return {
    records: ctx.records.map((r) =>
      withValidation(r, ctx, revisions.find((v) => v.recordId === r.id) ?? null, alerts.find((a) => a.recordId === r.id && !a.acknowledgedAt) ?? null)
    ),
    products: ctx.products,
    labs: ctx.labs,
    criteria: ctx.criteria,
    alerts,
  };
}

export async function adminRecord(id: string): Promise<AdminRecord | null> {
  const record = await getRecord(id);
  if (!record) return null;
  const [ctx, revision, alert] = await Promise.all([context(), pendingRevision(id), openAlertFor(id)]);
  const meta = record.fileId ? await getFileMeta(record.fileId) : null;
  return {
    ...withValidation(record, ctx, revision, alert),
    file: meta && { fileName: meta.fileName, sizeBytes: meta.sizeBytes, pageCount: meta.pageCount, sha256: meta.sha256 },
  };
}

// Fields the record can take, with the values derived from them (compound name, SKU, laboratory name, parsed figures,
// inventory lot). Derived values only ever come from the catalog or from the printed text.
function derive(record: CoaRecord, patch: RecordPatch, ctx: Ctx): RecordPatch {
  const next = { ...record, ...patch };
  const out: RecordPatch = { ...patch };
  const product = ctx.products.find((p) => p.slug === next.productSlug);
  if ("productSlug" in patch || "sizeLabel" in patch) {
    out.compoundName = product?.name ?? null;
    out.sku = product && next.sizeLabel ? `${product.slug}-${next.sizeLabel}`.toUpperCase().replace(/\s+/g, "") : null;
  }
  if ("productSlug" in patch || "lotNumber" in patch) {
    out.inventoryLot = product && next.lotNumber ? product.batchNumbers.find((b) => norm(b) === norm(next.lotNumber)) ?? null : null;
  }
  if ("laboratoryId" in patch) out.laboratoryName = ctx.labs.find((l) => l.id === next.laboratoryId)?.name ?? null;
  if ("purityResult" in patch && !("purityPercent" in patch)) out.purityPercent = parseResultNumber(next.purityResult, "%");
  if ("quantityResult" in patch && !("quantityMg" in patch)) out.quantityMg = parseResultNumber(next.quantityResult, "mg");
  if ("verificationUrl" in patch) {
    out.verificationStatus = next.verificationUrl ? "unchecked" : "none";
    out.verificationNote = null;
    out.verificationCheckedAt = null;
  }
  return out;
}

// Proposals from extraction, matched to the catalog and laboratory list. Only exact, unambiguous matches are filled
// in; the administrator confirms or corrects every one.
async function proposeFromPdf(text: string, pageCount: number, hasTextLayer: boolean, ctx: Ctx) {
  const { report, values, tests } = await extractCertificate(text, pageCount, hasTextLayer);
  const patch: RecordPatch = {};
  if (values.compoundName) {
    const printed = norm(values.compoundName);
    const matches = ctx.products.filter((p) => [p.name, ...p.alternateNames].some((n) => norm(n) && (printed === norm(n) || printed.includes(norm(n)))));
    const longest = matches.sort((a, b) => norm(b.name).length - norm(a.name).length);
    if (longest.length === 1 || (longest.length > 1 && norm(longest[0].name).length > norm(longest[1].name).length)) patch.productSlug = longest[0].slug;
    else if (longest.length > 1) report.notes.push(`"${values.compoundName}" matches more than one product (${longest.map((p) => p.name).join(", ")}); choose one.`);
    else report.notes.push(`"${values.compoundName}" doesn't match any product name or alias; choose the product.`);
  }
  const product = ctx.products.find((p) => p.slug === patch.productSlug);
  if (product && values.strength) {
    const size = product.sizes.find((s) => norm(s) === norm(values.strength));
    if (size) patch.sizeLabel = size;
    else report.notes.push(`Strength "${values.strength}" isn't one of ${product.name}'s sizes (${product.sizes.join(", ")}); choose the strength.`);
  } else if (product && !values.strength) {
    report.notes.push("The strength wasn't found on the certificate; choose it.");
  }
  // The laboratory: a registered laboratory whose name appears in the document, if exactly one does; otherwise the
  // extracted name, if it matches exactly one registered laboratory.
  const inText = ctx.labs.filter((l) => norm(text).includes(norm(l.name)));
  if (inText.length === 1) patch.laboratoryId = inText[0].id;
  else if (values.laboratoryName) {
    const lab = ctx.labs.filter((l) => norm(values.laboratoryName).includes(norm(l.name)) || norm(l.name).includes(norm(values.laboratoryName)));
    if (lab.length === 1) patch.laboratoryId = lab[0].id;
    else report.notes.push(`Laboratory "${values.laboratoryName}" ${lab.length ? "matches more than one entry" : "isn't on the laboratory list"}; choose or add it.`);
  }
  for (const key of ["labReportId", "testedOn", "issuedOn", "purityResult", "quantityResult", "appearance", "verificationUrl"] as const) {
    if (values[key]) (patch as Record<string, unknown>)[key] = values[key];
  }
  if (tests.length) patch.testResults = tests;
  return { report, lotNumber: values.lotNumber ?? null, patch };
}

// --- Upload ----------------------------------------------------------------------------------------------------------

export type UploadOutcome =
  | { ok: true; record: AdminRecord }
  | {
      ok: false;
      status: number;
      error: string;
      recordId?: string;
      // An existing report with the same lot and report number: probably a corrected certificate.
      conflict?: { kind: "duplicate_pdf" | "same_report"; recordId: string; lotNumber: string | null; labReportId: string | null; productSlug: string | null; sizeLabel: string | null; published: boolean; deleted: boolean };
    };

// New record from a PDF. Identical bytes already stored → refused, pointing at the existing record. Same lot AND same
// laboratory report number as an existing report → refused with the existing report, so the administrator chooses:
// upload it as a correction of that report, or (asNew) keep it as a separate record anyway. A different report number
// under an existing lot is a retest: a new report in the same lot.
export async function uploadCertificate(bytes: Uint8Array, fileName: string, isTest: boolean, actor: string, opts: { asNew?: boolean } = {}): Promise<UploadOutcome> {
  const inspection = await inspectPdf(bytes);
  if (!inspection.ok) return { ok: false, status: 400, error: inspection.reason };
  const ctx = await context();
  const dup = await findFileBySha(sha256(bytes));
  if (dup) {
    const r = dup.recordId ? ctx.records.find((x) => x.id === dup.recordId) : null;
    return {
      ok: false,
      status: 409,
      error: "This exact PDF has already been uploaded.",
      recordId: dup.recordId ?? undefined,
      conflict: r ? { kind: "duplicate_pdf", recordId: r.id, lotNumber: r.lotNumber, labReportId: r.labReportId, productSlug: r.productSlug, sizeLabel: r.sizeLabel, published: isPublished(r), deleted: Boolean(r.deletedAt) } : undefined,
    };
  }
  const { report, lotNumber, patch } = await proposeFromPdf(inspection.text, inspection.pageCount, inspection.hasTextLayer, ctx);
  if (!opts.asNew && lotNumber && patch.labReportId) {
    const same = ctx.records.find((r) => !r.deletedAt && norm(r.lotNumber) === norm(lotNumber) && norm(r.labReportId) === norm(patch.labReportId));
    if (same) {
      return {
        ok: false,
        status: 409,
        error: `Lot ${lotNumber} already has a report numbered ${patch.labReportId}. If this is a corrected version of that report, upload it as a correction from that record. Nothing was saved.`,
        recordId: same.id,
        conflict: { kind: "same_report", recordId: same.id, lotNumber: same.lotNumber, labReportId: same.labReportId, productSlug: same.productSlug, sizeLabel: same.sizeLabel, published: isPublished(same), deleted: Boolean(same.deletedAt) },
      };
    }
  }

  const safeName = fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "certificate.pdf";
  const file = await storeFile(bytes, { fileName: safeName, pageCount: inspection.pageCount, textLayer: inspection.text }, actor);
  const base = await createRecord({ lotNumber: null, fileId: file.id, isTest, extraction: report }, actor);
  const derived = derive(base, { ...patch, ...(lotNumber ? { lotNumber } : {}) }, ctx);
  await updateRecord(base.id, { ...derived, reviewStatus: "needs_review", approvalStatus: "pending", publicVisibility: "hidden" }, actor);
  if (lotNumber) await ensureLot(lotNumber, derived.productSlug ?? null, derived.sizeLabel ?? null, base.createdAt);

  await audit(base.id, "uploaded", actor, { fileName: safeName, sha256: file.sha256, sizeBytes: file.sizeBytes, pages: inspection.pageCount, isTest });
  await audit(base.id, "extracted", actor, { method: report.method, model: report.model, found: report.found, missing: report.missing, rejected: report.rejected, matched: patch, lotNumber });
  await logActivity(actor, "coa.uploaded", `${lotNumber ?? "(no lot found)"}${isTest ? " [TEST]" : ""}`);
  return { ok: true, record: (await adminRecord(base.id))! };
}

// A corrected laboratory PDF for an existing report (same testing event). For a published report it becomes a pending
// revision: the published version stays public until the correction is published, then is replaced atomically. For a
// report that isn't published, the draft simply takes the new PDF and goes back to review. Extracted values never
// overwrite fields an administrator set by hand.
export async function uploadCorrection(recordId: string, bytes: Uint8Array, fileName: string, actor: string): Promise<UploadOutcome> {
  const record = await getRecord(recordId);
  if (!record) return { ok: false, status: 404, error: "Record not found." };
  if (record.deletedAt) return { ok: false, status: 409, error: "This record is deleted. Restore it first." };
  const inspection = await inspectPdf(bytes);
  if (!inspection.ok) return { ok: false, status: 400, error: inspection.reason };
  const dup = await findFileBySha(sha256(bytes));
  if (dup) return { ok: false, status: 409, error: "This exact PDF has already been uploaded.", recordId: dup.recordId ?? undefined };
  const ctx = await context();
  const { report, lotNumber, patch } = await proposeFromPdf(inspection.text, inspection.pageCount, inspection.hasTextLayer, ctx);
  // A correction belongs to the same testing event: a different lot or report number on it is flagged, not applied.
  const notes: string[] = [];
  if (lotNumber && norm(lotNumber) !== norm(record.lotNumber)) notes.push(`The corrected PDF shows lot ${lotNumber}, not ${record.lotNumber ?? "—"}.`);
  if (patch.labReportId && norm(patch.labReportId) !== norm(record.labReportId)) notes.push(`The corrected PDF shows report ${patch.labReportId}, not ${record.labReportId ?? "—"}. If it's a different testing event, upload it as a new report instead.`);
  report.notes.push(...notes);
  const proposal: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (["productSlug", "sizeLabel", "labReportId", "verificationUrl", "laboratoryId"].includes(k)) continue; // identity stays as reviewed
    if (record.manualFields.includes(k)) continue; // hand-set values win
    proposal[k] = v;
  }
  const safeName = fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "corrected-certificate.pdf";
  const file = await storeFile(bytes, { fileName: safeName, pageCount: inspection.pageCount, textLayer: inspection.text }, actor);
  const derivedPatch = derive(record, { ...(proposal as RecordPatch), extraction: report }, ctx);

  if (isPublished(record)) {
    await savePendingRevision(record.id, "correction", { ...derivedPatch, reviewStatus: "reviewed" }, file.id, actor);
    await audit(record.id, "correction_uploaded", actor, { fileName: safeName, sha256: file.sha256, notes, proposal, pending: true });
  } else {
    // Not public: the draft takes the corrected PDF directly (the replaced file is kept, unreferenced, for the record).
    await updateRecord(record.id, { ...derivedPatch, reviewStatus: "needs_review", ...(record.approvalStatus === "approved" ? { approvalStatus: "pending", approvedAt: null, approvedBy: null } : {}) }, actor);
    await replaceRecordFile(record.id, file.id, actor);
    await audit(record.id, "correction_uploaded", actor, { fileName: safeName, sha256: file.sha256, previousFileId: record.fileId, notes, proposal, pending: false });
  }
  await logActivity(actor, "coa.correction_uploaded", record.lotNumber ?? "(no lot)");
  return { ok: true, record: (await adminRecord(record.id))! };
}

// --- Edit ------------------------------------------------------------------------------------------------------------

const EDITABLE = new Set([
  "lotNumber", "productSlug", "sizeLabel", "laboratoryId", "labReportId", "testedOn", "issuedOn", "purityResult", "purityPercent",
  "quantityResult", "quantityMg", "appearance", "testResults", "verificationUrl", "inventoryStatus", "historical", "dispositionOn",
]);
// Changing these doesn't alter what the certificate says, so it doesn't reopen review or withdraw approval.
const OPERATIONAL = new Set(["inventoryStatus", "historical", "dispositionOn"]);
// On a published report, changing these takes it off the public site at once (it must not stay attached to the wrong
// product, strength, lot or testing event), and a changed laboratory link must be confirmed again before any version
// of it is public. Owner decision D4 keeps the existing safeguard: a link edit after approval unpublishes.
const IDENTITY = new Set(["productSlug", "sizeLabel", "lotNumber", "labReportId", "laboratoryId", "verificationUrl"]);

function clean(input: Record<string, unknown>): { patch: RecordPatch; error?: string } {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!EDITABLE.has(k)) continue;
    if (k === "historical") { if (typeof v !== "boolean") return { patch, error: "historical must be true or false." }; patch[k] = v; continue; }
    if (k === "purityPercent" || k === "quantityMg") {
      if (v === null || v === "") { patch[k] = null; continue; }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || (k === "purityPercent" && n > 100)) return { patch, error: `${k === "purityPercent" ? "Purity" : "Quantity"} must be a number${k === "purityPercent" ? " from 0 to 100" : ""}.` };
      patch[k] = n;
      continue;
    }
    if (k === "inventoryStatus") { if (!(INVENTORY_STATUSES as readonly string[]).includes(String(v))) return { patch, error: "Unknown inventory status." }; patch[k] = v; continue; }
    if (k === "testResults") {
      if (!Array.isArray(v) || v.length > 30) return { patch, error: "Invalid test results." };
      const tests: TestResult[] = [];
      for (const t of v as Record<string, unknown>[]) {
        const name = String(t.name ?? "").trim().slice(0, 80);
        const status = String(t.status ?? "");
        if (!name || !(TEST_STATUSES as readonly string[]).includes(status)) return { patch, error: "Each test needs a name and a status." };
        tests.push({
          key: String(t.key ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40),
          name,
          method: t.method ? String(t.method).trim().slice(0, 120) || null : null,
          result: t.result ? String(t.result).trim().slice(0, 200) || null : null,
          status: status as TestResult["status"],
        });
      }
      patch[k] = tests;
      continue;
    }
    if (v === null || v === undefined) { patch[k] = null; continue; }
    if (typeof v !== "string") return { patch, error: `${k} must be text.` };
    const s = v.replace(/\s+/g, " ").trim().slice(0, k === "verificationUrl" ? 500 : 200);
    if (/[\u0000-\u001F\u007F]/.test(s)) return { patch, error: `${k} contains control characters.` };
    patch[k] = s || null;
  }
  return { patch: patch as RecordPatch };
}

// SAVE CHANGES. Works on incomplete drafts: nothing here requires extraction to have worked, a field to be filled, or a
// warning to be cleared, and nothing here publishes. Every field saved by hand is remembered (manual_fields) so
// extraction never overwrites it.
export async function editRecord(id: string, input: Record<string, unknown>, actor: string): Promise<{ ok: true; record: AdminRecord; revision?: boolean; unpublished?: boolean } | { ok: false; status: number; error: string }> {
  const record = await getRecord(id);
  if (!record) return { ok: false, status: 404, error: "Record not found." };
  if (record.deletedAt) return { ok: false, status: 409, error: "This record is deleted. Restore it to edit it." };
  if (record.approvalStatus === "rejected") return { ok: false, status: 409, error: "A rejected record is closed. Upload the certificate again to start a new record." };
  const { patch, error } = clean(input);
  if (error) return { ok: false, status: 400, error };
  const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => JSON.stringify((record as Record<string, unknown>)[k] ?? null) !== JSON.stringify(v ?? null)));
  if (Object.keys(changed).length === 0) return { ok: true, record: (await adminRecord(id))! };
  const keys = Object.keys(changed);
  const manualFields = Array.from(new Set([...record.manualFields, ...keys]));

  const ctx = await context();
  const diff = Object.fromEntries(keys.map((k) => [k, { from: (record as Record<string, unknown>)[k] ?? null, to: (changed as Record<string, unknown>)[k] ?? null }]));

  // Published report, content corrections only → a pending revision; the published version stays public.
  if (isPublished(record) && !keys.some((k) => IDENTITY.has(k)) && keys.some((k) => !OPERATIONAL.has(k))) {
    const operational = Object.fromEntries(keys.filter((k) => OPERATIONAL.has(k)).map((k) => [k, (changed as Record<string, unknown>)[k]]));
    const content = Object.fromEntries(keys.filter((k) => !OPERATIONAL.has(k)).map((k) => [k, (changed as Record<string, unknown>)[k]]));
    if (Object.keys(operational).length) await updateRecord(id, operational as RecordPatch, actor);
    await savePendingRevision(id, "edit", { ...derive(record, content as RecordPatch, ctx), reviewStatus: "reviewed" }, null, actor);
    await updateRecord(id, { manualFields }, actor);
    await audit(id, "revision_saved", actor, diff);
    return { ok: true, record: (await adminRecord(id))!, revision: true };
  }

  const derived = derive(record, changed as RecordPatch, ctx);
  const substantive = keys.some((k) => !OPERATIONAL.has(k));
  const identityChangeOnPublished = isPublished(record) && keys.some((k) => IDENTITY.has(k));
  if (substantive) {
    derived.reviewStatus = "needs_review";
    if (record.approvalStatus === "approved") {
      derived.approvalStatus = "pending";
      derived.publicVisibility = "hidden";
      derived.publishedAt = null;
      derived.publishedBy = null;
      derived.approvedAt = null;
      derived.approvedBy = null;
    }
  }
  derived.manualFields = manualFields;
  try {
    await updateRecord(id, derived, actor);
  } catch (err) {
    if (/coa_records_lot_report|duplicate key/i.test(String(err))) return { ok: false, status: 409, error: "Another record already holds this lot number with this laboratory report number." };
    throw err;
  }
  const lot = (changed as RecordPatch).lotNumber ?? null;
  if (lot) await ensureLot(lot, derived.productSlug ?? record.productSlug, derived.sizeLabel ?? record.sizeLabel, new Date().toISOString());
  await audit(id, "edited", actor, diff);
  if (keys.includes("verificationUrl")) await audit(id, "link_changed", actor, { from: record.verificationUrl, to: (changed as RecordPatch).verificationUrl ?? null });
  if (substantive && record.approvalStatus === "approved") {
    await audit(id, "approval_withdrawn", actor, {
      reason: identityChangeOnPublished
        ? "The product, strength, lot, report or laboratory link changed on a published certificate; it was taken off the public site and needs review, confirmation and publication again."
        : "The certificate data changed after approval; it needs approval again.",
    });
  }
  return { ok: true, record: (await adminRecord(id))!, unpublished: identityChangeOnPublished };
}

// --- Decisions ---------------------------------------------------------------------------------------------------------

export type Action =
  | "mark_reviewed"
  | "approve"
  | "reject"
  | "publish"
  | "unpublish"
  | "check_link"
  | "confirm_link"
  | "acknowledge_warnings"
  | "publish_revision"
  | "discard_revision"
  | "restore"
  | "acknowledge_alert";

type ActResult = { ok: true; record: AdminRecord } | { ok: false; status: number; error: string; issues?: Issue[] };

export async function act(id: string, action: Action, reason: string | null, actor: string, opts: { fetchImpl?: typeof fetch; url?: string | null } = {}): Promise<ActResult> {
  const current = await adminRecord(id);
  if (!current) return { ok: false, status: 404, error: "Record not found." };
  const label = `${current.lotNumber ?? "(no lot)"}${current.labReportId ? ` / ${current.labReportId}` : ""}${current.isTest ? " [TEST]" : ""}`;
  if (current.deletedAt && action !== "restore") return { ok: false, status: 409, error: "This record is deleted. Restore it first." };
  const blocking = () => current.issues.filter((i) => i.level === "error");

  switch (action) {
    case "mark_reviewed": {
      if (current.approvalStatus !== "pending") return { ok: false, status: 409, error: `This record is already ${current.approvalStatus}.` };
      await updateRecord(id, { reviewStatus: "reviewed" }, actor);
      await audit(id, "reviewed", actor);
      break;
    }
    case "check_link": {
      // A diagnostic only: its result never invalidates a link a person confirmed, and never blocks publication.
      const lab = (await listLabs()).find((l) => l.id === current.laboratoryId) ?? null;
      const result = await checkLinkLive(current, lab, opts.fetchImpl);
      await updateRecord(id, { verificationStatus: result.status, verificationNote: result.note, verificationCheckedAt: new Date().toISOString() }, actor);
      await audit(id, "link_checked", actor, { url: current.verificationUrl, ...result });
      break;
    }
    case "confirm_link": {
      // CONFIRM LABORATORY LINK: the administrator opened the stored link and saw this report. The exact URL they
      // confirm must be the stored one, and it must pass the address rules (https, the laboratory's allowlisted host,
      // a specific record page).
      if (!current.verificationUrl) return { ok: false, status: 409, error: "There's no laboratory link to confirm." };
      if (!current.labReportId) return { ok: false, status: 409, error: "Enter the laboratory report number first; the confirmation is for this report." };
      if (opts.url !== undefined && opts.url !== current.verificationUrl) return { ok: false, status: 409, error: "The link changed since you opened it. Open it again and confirm the current one." };
      const lab = (await listLabs()).find((l) => l.id === current.laboratoryId) ?? null;
      const structural = checkVerificationUrl(current.verificationUrl, lab, current);
      if (!structural.ok) return { ok: false, status: 422, error: `This link can't be confirmed: ${structural.reason}` };
      const now = new Date().toISOString();
      await updateRecord(id, { linkConfirmedUrl: current.verificationUrl, linkConfirmedBy: actor, linkConfirmedAt: now, linkConfirmedReportId: current.labReportId }, actor);
      await audit(id, "link_confirmed", actor, { url: current.verificationUrl, labReportId: current.labReportId, lotNumber: current.lotNumber, automaticCheck: current.verificationStatus });
      await logActivity(actor, "coa.link_confirmed", label);
      break;
    }
    case "acknowledge_warnings": {
      // Acknowledges every advisory finding currently shown — on the record, and on its pending revision if there is
      // one (what will be published). Recorded with who and when; a finding that changes needs a new acknowledgment.
      const findings = [...current.issues, ...(current.pendingRevision?.issues ?? [])].filter((i) => i.level === "advisory");
      const unique = Array.from(new Map(findings.map((i) => [`${i.code}|${i.message}`, { code: i.code, message: i.message }])).values());
      if (!unique.length) return { ok: false, status: 409, error: "There are no quality warnings to acknowledge." };
      const now = new Date().toISOString();
      const note = (reason ?? "").replace(/\s+/g, " ").trim().slice(0, 500) || null;
      await updateRecord(id, { warningsAcknowledged: unique, warningsAcknowledgedBy: actor, warningsAcknowledgedAt: now }, actor);
      await audit(id, "warnings_acknowledged", actor, { warnings: unique, note });
      await logActivity(actor, "coa.warnings_acknowledged", label);
      break;
    }
    case "approve": {
      if (current.approvalStatus !== "pending") return { ok: false, status: 409, error: `This record is already ${current.approvalStatus}.` };
      if (blocking().length) return { ok: false, status: 422, error: "This record can't be approved yet.", issues: blocking() };
      if (current.unacknowledged.length) return { ok: false, status: 422, error: "Acknowledge the quality warnings first.", issues: current.unacknowledged };
      const now = new Date().toISOString();
      await updateRecord(id, { approvalStatus: "approved", approvedAt: now, approvedBy: actor }, actor);
      await audit(id, "approved", actor, { checks: current.checks, acknowledged: current.warningsAcknowledged });
      await logActivity(actor, "coa.approved", label);
      break;
    }
    case "reject": {
      if (current.approvalStatus === "rejected") return { ok: false, status: 409, error: "This record is already rejected." };
      const why = (reason ?? "").replace(/\s+/g, " ").trim();
      if (why.length < 3) return { ok: false, status: 400, error: "Give a reason for the rejection." };
      await updateRecord(id, { approvalStatus: "rejected", rejectionReason: why.slice(0, 500), publicVisibility: "hidden", publishedAt: null, publishedBy: null, approvedAt: null, approvedBy: null }, actor);
      await audit(id, "rejected", actor, { reason: why.slice(0, 500), wasApproved: current.approvalStatus === "approved" });
      await logActivity(actor, "coa.rejected", label);
      break;
    }
    case "publish": {
      // PUBLISH. Every hard requirement is re-checked here, server-side, at the moment of publishing.
      if (current.isTest) return { ok: false, status: 409, error: "Synthetic test records are never published. Use Preview Public View to see how it would look." };
      if (current.approvalStatus !== "approved") return { ok: false, status: 409, error: "Approve the record before publishing it." };
      if (current.isPublished) return { ok: false, status: 409, error: "This certificate is already published." };
      if (!current.fileId) return { ok: false, status: 409, error: "A certificate can't be published without its original laboratory PDF." };
      if (!current.verificationUrl || !current.linkConfirmed) return { ok: false, status: 409, error: "Open the laboratory link and confirm it shows this report before publishing." };
      if (blocking().length) return { ok: false, status: 422, error: "This record can't be published yet.", issues: blocking() };
      if (current.unacknowledged.length) return { ok: false, status: 422, error: "Acknowledge the quality warnings first.", issues: current.unacknowledged };
      // One statement: it becomes public and records who published it, together.
      const now = new Date().toISOString();
      await updateRecord(id, { publicVisibility: "public", publishedAt: now, publishedBy: actor }, actor);
      if (current.lotNumber) await ensureLot(current.lotNumber, current.productSlug, current.sizeLabel, current.createdAt);
      await audit(id, "published", actor, { acknowledged: current.warningsAcknowledged, linkConfirmedBy: current.linkConfirmedBy, linkConfirmedAt: current.linkConfirmedAt });
      await logActivity(actor, "coa.published", label);
      await raiseQualityAlert(current, current.issues, actor);
      break;
    }
    case "unpublish": {
      // Off the public site at once: search, lot pages and the PDF route all require it to be published. Inventory,
      // availability and checkout are untouched.
      await updateRecord(id, { publicVisibility: "hidden", publishedAt: null, publishedBy: null }, actor);
      await audit(id, "unpublished", actor, { reason: (reason ?? "").trim().slice(0, 500) || null });
      await logActivity(actor, "coa.unpublished", label);
      break;
    }
    case "publish_revision": {
      const rev = current.pendingRevision;
      if (!rev) return { ok: false, status: 409, error: "There's no pending revision to publish." };
      if (!current.isPublished) return { ok: false, status: 409, error: "Only a published certificate has revisions to publish." };
      const revErrors = rev.issues.filter((i) => i.level === "error");
      if (revErrors.length) return { ok: false, status: 422, error: "The revision can't be published yet.", issues: revErrors };
      if (rev.unacknowledged.length) return { ok: false, status: 422, error: "Acknowledge the quality warnings on the revision first.", issues: rev.unacknowledged };
      const previous = Object.fromEntries([...Object.keys(rev.patch), "fileId"].map((k) => [k, (current as Record<string, unknown>)[k] ?? null]));
      const { issues: _i, unacknowledged: _u, canPublish: _c, ...plain } = rev;
      void _i; void _u; void _c;
      await applyRevision(plain, rev.patch as RecordPatch, previous, actor);
      await audit(id, rev.kind === "correction" ? "report_replaced" : "revision_published", actor, { revisionId: rev.id, previous, now: rev.patch, newFileId: rev.fileId });
      await logActivity(actor, rev.kind === "correction" ? "coa.report_replaced" : "coa.revision_published", label);
      await raiseQualityAlert(current, rev.issues, actor);
      break;
    }
    case "discard_revision": {
      if (!current.pendingRevision) return { ok: false, status: 409, error: "There's no pending revision." };
      await discardRevision(current.pendingRevision.id, actor);
      await audit(id, "revision_discarded", actor, { revisionId: current.pendingRevision.id });
      break;
    }
    case "restore": {
      if (!current.deletedAt) return { ok: false, status: 409, error: "This record isn't deleted." };
      await restoreRecord(id, actor);
      await audit(id, "restored", actor);
      await logActivity(actor, "coa.restored", label);
      break;
    }
    case "acknowledge_alert": {
      if (!current.openAlert) return { ok: false, status: 409, error: "There's no open inventory alert on this record." };
      const note = (reason ?? "").replace(/\s+/g, " ").trim();
      if (note.length < 3) return { ok: false, status: 400, error: "Say what was done about the inventory (e.g. removed from sale, stock quarantined)." };
      await acknowledgeAlert(current.openAlert.id, note.slice(0, 500), actor);
      await audit(id, "inventory_alert_acknowledged", actor, { alertId: current.openAlert.id, note: note.slice(0, 500) });
      await logActivity(actor, "coa.inventory_alert_acknowledged", label);
      break;
    }
  }
  return { ok: true, record: (await adminRecord(id))! };
}

// A published report with a failed specification or failed test opens a persistent QUALITY ALERT — REVIEW INVENTORY
// (one open alert per report). It changes nothing in inventory, availability or checkout; it stays until acknowledged.
async function raiseQualityAlert(record: CoaRecord, issues: Issue[], actor: string): Promise<void> {
  const failed = issues.filter((i) => i.level === "advisory" && (i.code.startsWith("oos_") || i.code.startsWith("test_failed_")));
  if (!failed.length) return;
  if (await openAlertFor(record.id)) return;
  await createAlert(record, "QUALITY ALERT — REVIEW INVENTORY / REMOVE FROM SALE", { failed: failed.map((f) => f.message) }, actor);
  await audit(record.id, "inventory_alert_raised", actor, { failed: failed.map((f) => f.message) });
}

// DELETE COA: recoverable. The record leaves every public path immediately (search, lot pages, PDF route), its lot's
// current/historical standing is recomputed on the next read, and the record, PDF and history are kept. Other reports
// in the same lot are untouched. Approved certificates can be deleted this way too (owner decision D3): nothing is
// destroyed, so the retention requirement still holds.
export async function removeRecord(id: string, actor: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const record = await getRecord(id);
  if (!record) return { ok: false, status: 404, error: "Record not found." };
  if (record.deletedAt) return { ok: false, status: 409, error: "This record is already deleted." };
  await softDeleteRecord(id, actor);
  const rev = await pendingRevision(id);
  if (rev) await discardRevision(rev.id, actor);
  await audit(id, "deleted", actor, {
    lotNumber: record.lotNumber,
    labReportId: record.labReportId,
    productSlug: record.productSlug,
    sizeLabel: record.sizeLabel,
    approvalStatus: record.approvalStatus,
    wasPublished: isPublished(record),
    fileId: record.fileId,
    isTest: record.isTest,
  });
  await logActivity(actor, "coa.deleted", `${record.lotNumber ?? "(no lot)"}${record.isTest ? " [TEST]" : ""}`);
  return { ok: true };
}

export { listLabs, listCriteria };
