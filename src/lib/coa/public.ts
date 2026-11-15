import { listProducts } from "@/lib/products/store";
import { withStock } from "@/lib/inventory";
import { availabilityStatus, strengthStatus } from "@/lib/products/availability";
import type { Product } from "@/lib/types";
import { getRecord, listLabs, listLots, listPublishedRecords, pendingRevision } from "./store";
import { pricedSizes } from "@/lib/products/pricing";
import { buildGroups, searchCertificates, type CatalogCandidate, type Searchable, type SearchResult } from "./search";
import { linkConfirmed } from "./validate";
import { checkVerificationUrl } from "./verification-url";
import type { CertificateGroup, CoaRecord, Laboratory, LotAvailability } from "./types";

// Server-only. What the public can see of the certificate records, and nothing more.
//
// A record is public only when it was deliberately PUBLISHED (approved + public + published_at, lib/coa/store.ts
// PUBLISHED_WHERE), is not deleted, and is not test data. Draft, pending, rejected, unpublished, deleted, superseded
// (a corrected report replaces its record's file and values atomically) and synthetic records never reach any public
// path: search, autocomplete, lot pages or the PDF route. The single exception for test data is a local `next dev`
// session started with COA_INCLUDE_TEST_RECORDS=1; NODE_ENV is "production" in every built deployment (including
// Vercel previews), where the flag has no effect.
export function includeTestRecords(): boolean {
  return process.env.NODE_ENV === "development" && process.env.COA_INCLUDE_TEST_RECORDS === "1";
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Whether a lot is currently sold, from the catalog and inventory (unless an administrator set it explicitly). Kept
// for administrative display; the public results don't use it (current/historical comes from upload chronology).
export function lotAvailability(record: CoaRecord, product: Product | undefined): LotAvailability {
  if (record.historical) return "historical";
  if (record.inventoryStatus === "available") return "available";
  const lotListed = Boolean(product?.batchNumbers.some((b) => norm(b) === norm(record.lotNumber)));
  if (record.inventoryStatus === "unavailable") return lotListed ? "unavailable" : "historical";
  if (!product || !lotListed) return "historical";
  const remaining = record.sizeLabel ? product.sizeStock?.[record.sizeLabel]?.remaining ?? 0 : product.stock?.remaining ?? 0;
  // The record's own strength's status where it names one (Stage 1: status is per strength).
  const strength = record.sizeLabel ? product.sizes.find((s) => s.label === record.sizeLabel) : undefined;
  const status = strength ? strengthStatus(product, strength) : availabilityStatus(product);
  const sold = product.active !== false && strength?.active !== false && status === "in_stock" && remaining > 0;
  return sold ? "available" : "unavailable";
}

// The laboratory link the public may follow: the exact stored URL, only while a person's confirmation still matches
// it and it still passes the address rules (https, the laboratory's allowlisted host, a specific record page).
function publicLabUrl(record: CoaRecord, labs: Laboratory[]): string | null {
  if (!record.verificationUrl || !linkConfirmed(record)) return null;
  const lab = labs.find((l) => l.id === record.laboratoryId) ?? null;
  return checkVerificationUrl(record.verificationUrl, lab, record).ok ? record.verificationUrl : null;
}

function toSearchable(record: CoaRecord, product: Product | undefined, labs: Laboratory[], pdfUrl: string): Searchable {
  // The product's current name, plus the name stored on the certificate when it was associated — so a renamed product
  // stays findable by its earlier name. The PDF is never altered.
  const name = product?.name ?? record.compoundName ?? "Unknown compound";
  const aliases = [...(product?.alternateNames ?? []), ...(record.compoundName && record.compoundName !== name ? [record.compoundName] : [])];
  return {
    id: record.id,
    lotNumber: record.lotNumber ?? "",
    laboratoryName: record.laboratoryName,
    labReportId: record.labReportId,
    testedOn: record.testedOn,
    issuedOn: record.issuedOn,
    pdfUrl,
    verificationUrl: publicLabUrl(record, labs),
    compoundName: name + (record.isTest ? " [TEST DATA]" : ""),
    sizeLabel: record.sizeLabel,
    sku: record.sku,
    productSlug: record.productSlug,
    aliases,
    createdAt: record.createdAt,
  };
}

async function publishedSearchables(): Promise<Searchable[]> {
  const [records, products, labs] = await Promise.all([listPublishedRecords(includeTestRecords()), listProducts({ includeInactive: true }).then(withStock), listLabs()]);
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  // Published regardless of catalog state: in stock, coming soon, out of stock, hidden or discontinued.
  return records
    .filter((r) => r.lotNumber)
    .map((r) => toSearchable(r, r.productSlug ? bySlug.get(r.productSlug) : undefined, labs, `/api/verify/certificate/${r.id}`));
}

// Public certificate search — identical for every visitor, signed in or not (public certificate lookup needs no
// account). The "no published certificate" catalog suggestions come from the active, on-sale products and carry
// compound, strength and SKU only (no price, stock, slug or link). The catalog API itself stays gated.
export async function searchPublic(q: string): Promise<SearchResult> {
  const [items, catalog, lots] = await Promise.all([publishedSearchables(), listProducts(), listLots()]);
  const candidates: CatalogCandidate[] = catalog.flatMap((p) => {
    const sizes = pricedSizes(p);
    // Active strengths only (pricedSizes); the strength's stored SKU code (Stage 1), which equals the convention below
    // unless the strength was renamed after it was created.
    return (sizes.length ? sizes : [null]).map((s) => ({
      compoundName: p.name,
      aliases: p.alternateNames ?? [],
      productSlug: p.slug,
      sizeLabel: s?.label ?? null,
      sku: s ? s.sku ?? `${p.slug}-${s.label}`.toUpperCase().replace(/\s+/g, "") : null,
    }));
  });
  return searchCertificates(q, items, lots, candidates);
}

// The product + strength groups holding one lot number, for the permanent lot page (/lot/<lot>).
export async function publicGroupsForLot(lot: string): Promise<CertificateGroup[]> {
  const [items, lots] = await Promise.all([publishedSearchables(), listLots()]);
  const keys = new Set(items.filter((i) => norm(i.lotNumber) === norm(lot)).map((i) => `${i.productSlug ?? norm(i.compoundName)}|${norm(i.sizeLabel)}`));
  const inGroups = items.filter((i) => keys.has(`${i.productSlug ?? norm(i.compoundName)}|${norm(i.sizeLabel)}`));
  return buildGroups(inGroups, lots).map((g) => ({ ...g, matchedLots: [lot] }));
}

// "slug|lot" for every lot with a published certificate — for product pages (link a lot to its certificate) and the
// purity rule. Fails closed: if the certificate tables can't be read, no lot counts as certified.
export async function publishedLotKeys(): Promise<Set<string>> {
  try {
    const records = await listPublishedRecords(includeTestRecords());
    return new Set(records.filter((r) => r.productSlug && r.lotNumber).map((r) => `${r.productSlug}|${norm(r.lotNumber)}`));
  } catch (err) {
    console.error("[coa] could not read published certificates:", err);
    return new Set();
  }
}

export function lotKey(slug: string, lot: string): string {
  return `${slug}|${norm(lot)}`;
}

// The record behind a public certificate id, only if it is currently published (and not test data / deleted).
export async function publicRecordById(id: string): Promise<CoaRecord | null> {
  const records = await listPublishedRecords(includeTestRecords());
  return records.find((r) => r.id === id) ?? null;
}

// ADMINISTRATIVE PREVIEW (Executive Office only — the caller must have checked the executive session). The real
// customer-facing groups for this record's product + strength: what is published now, plus this record as it would
// read once published (with its pending revision applied, if any). Works for drafts, pending revisions and synthetic
// records. Changes nothing; the PDF links point at the administrator-only PDF route.
export async function previewGroupsForRecord(id: string): Promise<CertificateGroup[] | null> {
  const record = await getRecord(id);
  if (!record || record.deletedAt) return null;
  const revision = await pendingRevision(id);
  const shown: CoaRecord = revision ? { ...record, ...(revision.patch as Partial<CoaRecord>), fileId: revision.fileId ?? record.fileId } : record;
  if (!shown.lotNumber) return [];
  const [published, products, labs, lots] = await Promise.all([listPublishedRecords(false), listProducts({ includeInactive: true }), listLabs(), listLots()]);
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const same = (r: CoaRecord) => r.productSlug === shown.productSlug && norm(r.sizeLabel) === norm(shown.sizeLabel);
  const items = [
    ...published.filter((r) => r.id !== id && same(r)).map((r) => toSearchable(r, bySlug.get(r.productSlug ?? ""), labs, `/api/verify/certificate/${r.id}`)),
    // Preview shows the link as stored, confirmed or not, so the administrator can see what customers will open.
    { ...toSearchable(shown, bySlug.get(shown.productSlug ?? ""), labs, `/api/executive/certificates/${id}/pdf${revision?.fileId ? "?revision=1" : ""}`), verificationUrl: shown.verificationUrl },
  ];
  // A preview of a record whose lot is new isn't in coa_lots yet: treat it as uploaded when the record was.
  return buildGroups(items, lots).map((g) => ({ ...g, matchedLots: [shown.lotNumber!], preview: true }));
}
