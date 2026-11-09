import { listProducts } from "@/lib/products/store";
import { logActivity } from "@/lib/activity-log";
import { parseResultNumber } from "./criteria";
import { extractCertificate, inspectPdf } from "./extract";
import {
  audit,
  createRecord,
  deleteRecord,
  findFileBySha,
  getFileMeta,
  getRecord,
  listCriteria,
  listLabs,
  listRecords,
  sha256,
  storeFile,
  updateRecord,
  type RecordPatch,
} from "./store";
import { checkLinkLive } from "./url-check";
import { validateRecord, type Issue, type ProductInfo } from "./validate";
import type { CriterionCheck } from "./criteria";
import { INVENTORY_STATUSES, TEST_STATUSES, type CoaRecord, type TestResult } from "./types";

// Server-only. The admin workflow for certificate records: upload → extract → match → review/correct → approve or
// reject → publish. Every step is audited with the acting account. Nothing here approves or publishes by itself.

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const today = () => new Date().toISOString().slice(0, 10);

export type AdminRecord = CoaRecord & {
  issues: Issue[];
  checks: CriterionCheck[];
  canApprove: boolean;
  file: { fileName: string; sizeBytes: number; pageCount: number | null; sha256: string } | null;
};

async function context() {
  const [products, criteria, labs, records] = await Promise.all([listProducts({ includeInactive: true }), listCriteria(), listLabs(), listRecords()]);
  const productInfo: ProductInfo[] = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    alternateNames: p.alternateNames ?? [],
    sizes: p.sizes.map((s) => s.label),
    batchNumbers: p.batchNumbers,
  }));
  return { products: productInfo, criteria, labs, records };
}

function withValidation(record: CoaRecord, ctx: Awaited<ReturnType<typeof context>>): Omit<AdminRecord, "file"> {
  const { issues, checks } = validateRecord(record, {
    product: ctx.products.find((p) => p.slug === record.productSlug) ?? null,
    criteria: ctx.criteria,
    labs: ctx.labs,
    others: ctx.records.map((r) => ({ id: r.id, lotNumber: r.lotNumber, labReportId: r.labReportId, approvalStatus: r.approvalStatus })),
    today: today(),
  });
  return { ...record, issues, checks, canApprove: record.approvalStatus === "pending" && !issues.some((i) => i.level === "error") };
}

export async function adminOverview() {
  const ctx = await context();
  return {
    records: ctx.records.map((r) => withValidation(r, ctx)),
    products: ctx.products,
    labs: ctx.labs,
    criteria: ctx.criteria,
  };
}

export async function adminRecord(id: string): Promise<AdminRecord | null> {
  const record = await getRecord(id);
  if (!record) return null;
  const ctx = await context();
  const meta = record.fileId ? await getFileMeta(record.fileId) : null;
  return { ...withValidation(record, ctx), file: meta && { fileName: meta.fileName, sizeBytes: meta.sizeBytes, pageCount: meta.pageCount, sha256: meta.sha256 } };
}

// Fields the record can take, with the values derived from them (compound name, SKU, laboratory name, parsed
// figures, inventory lot). Derived values only ever come from the catalog or from the printed text.
async function derive(record: CoaRecord, patch: RecordPatch, ctx: Awaited<ReturnType<typeof context>>): Promise<RecordPatch> {
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

// --- Upload ----------------------------------------------------------------------------------------------------------

export type UploadOutcome =
  | { ok: true; record: AdminRecord }
  | { ok: false; status: number; error: string; recordId?: string };

export async function uploadCertificate(bytes: Uint8Array, fileName: string, isTest: boolean, actor: string): Promise<UploadOutcome> {
  const inspection = await inspectPdf(bytes);
  if (!inspection.ok) return { ok: false, status: 400, error: inspection.reason };
  const existing = await findFileBySha(sha256(bytes));
  if (existing) return { ok: false, status: 409, error: "This exact PDF has already been uploaded.", recordId: existing.recordId ?? undefined };

  const safeName = fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "certificate.pdf";
  const file = await storeFile(bytes, { fileName: safeName, pageCount: inspection.pageCount, textLayer: inspection.text }, actor);
  const { report, values, tests } = await extractCertificate(inspection.text, inspection.pageCount, inspection.hasTextLayer);

  // Match to the catalog and laboratory list. Only exact, unambiguous matches are filled in; the administrator
  // confirms or corrects every one.
  const ctx = await context();
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
    else report.notes.push(`Strength "${values.strength}" isn't one of ${product.name}'s sizes (${product.sizes.join(", ")}).`);
  }
  if (values.laboratoryName) {
    const lab = ctx.labs.filter((l) => norm(values.laboratoryName).includes(norm(l.name)) || norm(l.name).includes(norm(values.laboratoryName)));
    if (lab.length === 1) patch.laboratoryId = lab[0].id;
    else report.notes.push(`Laboratory "${values.laboratoryName}" ${lab.length ? "matches more than one entry" : "isn't on the laboratory list"}; choose or add it.`);
  }
  for (const [field, key] of [["labReportId", "labReportId"], ["testedOn", "testedOn"], ["issuedOn", "issuedOn"], ["purityResult", "purityResult"], ["quantityResult", "quantityResult"], ["appearance", "appearance"], ["verificationUrl", "verificationUrl"]] as const) {
    if (values[field]) (patch as Record<string, unknown>)[key] = values[field];
  }
  if (tests.length) patch.testResults = tests;

  const base = await createRecord({ lotNumber: values.lotNumber ?? null, fileId: file.id, isTest, extraction: report }, actor);
  const derived = await derive(base, { ...patch, ...(values.lotNumber ? { lotNumber: values.lotNumber } : {}) }, ctx);
  await updateRecord(base.id, { ...derived, reviewStatus: "needs_review", approvalStatus: "pending", publicVisibility: "hidden" }, actor);

  await audit(base.id, "uploaded", actor, { fileName: safeName, sha256: file.sha256, sizeBytes: file.sizeBytes, pages: inspection.pageCount, isTest });
  await audit(base.id, "extracted", actor, { method: report.method, model: report.model, found: Object.keys(report.found), missing: report.missing, rejected: report.rejected, matched: patch });
  await logActivity(actor, "coa.uploaded", `${values.lotNumber ?? "(no lot found)"}${isTest ? " [TEST]" : ""}`);
  return { ok: true, record: (await adminRecord(base.id))! };
}

// --- Edit ------------------------------------------------------------------------------------------------------------

const EDITABLE = new Set([
  "lotNumber", "productSlug", "sizeLabel", "laboratoryId", "labReportId", "testedOn", "issuedOn", "purityResult", "purityPercent",
  "quantityResult", "quantityMg", "appearance", "testResults", "verificationUrl", "inventoryStatus", "historical", "dispositionOn",
]);
// Changing these doesn't alter what the certificate says, so it doesn't reopen review or withdraw approval.
const OPERATIONAL = new Set(["inventoryStatus", "historical", "dispositionOn"]);

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

export async function editRecord(id: string, input: Record<string, unknown>, actor: string): Promise<{ ok: true; record: AdminRecord } | { ok: false; status: number; error: string }> {
  const record = await getRecord(id);
  if (!record) return { ok: false, status: 404, error: "Record not found." };
  if (record.approvalStatus === "rejected") return { ok: false, status: 409, error: "A rejected record is closed. Upload the certificate again to start a new record." };
  const { patch, error } = clean(input);
  if (error) return { ok: false, status: 400, error };
  const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => JSON.stringify((record as Record<string, unknown>)[k] ?? null) !== JSON.stringify(v ?? null)));
  if (Object.keys(changed).length === 0) return { ok: true, record: (await adminRecord(id))! };

  const ctx = await context();
  const derived = await derive(record, changed as RecordPatch, ctx);
  const substantive = Object.keys(changed).some((k) => !OPERATIONAL.has(k));
  if (substantive) {
    derived.reviewStatus = "needs_review";
    if (record.approvalStatus === "approved") {
      derived.approvalStatus = "pending";
      derived.publicVisibility = "hidden";
      derived.approvedAt = null;
      derived.approvedBy = null;
    }
  }
  try {
    await updateRecord(id, derived, actor);
  } catch (err) {
    if (/coa_records_lot_report|duplicate key/i.test(String(err))) return { ok: false, status: 409, error: "Another record already holds this lot number with this laboratory report number." };
    throw err;
  }
  const diff = Object.fromEntries(Object.keys(changed).map((k) => [k, { from: (record as Record<string, unknown>)[k] ?? null, to: (changed as Record<string, unknown>)[k] ?? null }]));
  await audit(id, "edited", actor, diff);
  if (substantive && record.approvalStatus === "approved") await audit(id, "approval_withdrawn", actor, { reason: "The certificate data changed after approval; it was unpublished and needs approval again." });
  return { ok: true, record: (await adminRecord(id))! };
}

// --- Decisions ---------------------------------------------------------------------------------------------------------

export type Action = "mark_reviewed" | "approve" | "reject" | "publish" | "unpublish" | "check_link";

export async function act(id: string, action: Action, reason: string | null, actor: string, fetchImpl?: typeof fetch): Promise<{ ok: true; record: AdminRecord } | { ok: false; status: number; error: string; issues?: Issue[] }> {
  const current = await adminRecord(id);
  if (!current) return { ok: false, status: 404, error: "Record not found." };
  const label = `${current.lotNumber ?? "(no lot)"}${current.isTest ? " [TEST]" : ""}`;
  switch (action) {
    case "mark_reviewed": {
      if (current.approvalStatus !== "pending") return { ok: false, status: 409, error: `This record is already ${current.approvalStatus}.` };
      await updateRecord(id, { reviewStatus: "reviewed" }, actor);
      await audit(id, "reviewed", actor);
      break;
    }
    case "approve": {
      if (current.approvalStatus !== "pending") return { ok: false, status: 409, error: `This record is already ${current.approvalStatus}.` };
      const errors = current.issues.filter((i) => i.level === "error");
      if (errors.length) return { ok: false, status: 422, error: "This record can't be approved yet.", issues: errors };
      const now = new Date().toISOString();
      await updateRecord(id, { approvalStatus: "approved", approvedAt: now, approvedBy: actor }, actor);
      await audit(id, "approved", actor, { checks: current.checks });
      await logActivity(actor, "coa.approved", label);
      break;
    }
    case "reject": {
      if (current.approvalStatus === "rejected") return { ok: false, status: 409, error: "This record is already rejected." };
      const why = (reason ?? "").replace(/\s+/g, " ").trim();
      if (why.length < 3) return { ok: false, status: 400, error: "Give a reason for the rejection." };
      await updateRecord(id, { approvalStatus: "rejected", rejectionReason: why.slice(0, 500), publicVisibility: "hidden", approvedAt: null, approvedBy: null }, actor);
      await audit(id, "rejected", actor, { reason: why.slice(0, 500), wasApproved: current.approvalStatus === "approved" });
      await logActivity(actor, "coa.rejected", label);
      break;
    }
    case "publish": {
      if (current.approvalStatus !== "approved") return { ok: false, status: 409, error: "Only an approved record can be published." };
      if (!current.fileId || !current.lotNumber) return { ok: false, status: 409, error: "A record needs its PDF and lot number to be published." };
      await updateRecord(id, { publicVisibility: "public" }, actor);
      await audit(id, "published", actor);
      await logActivity(actor, "coa.published", label);
      break;
    }
    case "unpublish": {
      await updateRecord(id, { publicVisibility: "hidden" }, actor);
      await audit(id, "unpublished", actor);
      await logActivity(actor, "coa.unpublished", label);
      break;
    }
    case "check_link": {
      const lab = (await listLabs()).find((l) => l.id === current.laboratoryId) ?? null;
      const result = await checkLinkLive(current, lab, fetchImpl);
      await updateRecord(id, { verificationStatus: result.status, verificationNote: result.note, verificationCheckedAt: new Date().toISOString() }, actor);
      await audit(id, "link_checked", actor, { url: current.verificationUrl, ...result });
      break;
    }
  }
  return { ok: true, record: (await adminRecord(id))! };
}

export async function removeRecord(id: string, actor: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const record = await getRecord(id);
  if (!record) return { ok: false, status: 404, error: "Record not found." };
  // Approved certificates are retained (at least three years after the lot's final disposition); they can be
  // unpublished or marked historical, never deleted from here.
  if (record.approvalStatus === "approved") return { ok: false, status: 409, error: "Approved certificates are retained and can't be deleted. Unpublish it or mark the lot historical instead." };
  await audit(id, "deleted", actor, { lotNumber: record.lotNumber, labReportId: record.labReportId, approvalStatus: record.approvalStatus, fileId: record.fileId, isTest: record.isTest });
  await deleteRecord(id);
  await logActivity(actor, "coa.deleted", `${record.lotNumber ?? "(no lot)"}${record.isTest ? " [TEST]" : ""}`);
  return { ok: true };
}

export { listLabs, listCriteria };
