import { listProducts } from "@/lib/products/store";
import { withStock } from "@/lib/inventory";
import { availabilityStatus } from "@/lib/products/availability";
import type { Product } from "@/lib/types";
import { listLabs, listPublishedRecords } from "./store";
import { isUnreadableLabRecord } from "./lab-record-rules";
import { pricedSizes } from "@/lib/products/pricing";
import { searchCertificates, type CatalogCandidate, type Searchable, type SearchResult } from "./search";
import type { CoaRecord, Laboratory, LotAvailability, PublicCertificate } from "./types";

// Server-only. What the public can see of the certificate records, and nothing more.
//
// A record is public only when it is approved AND published. Test data (is_test) is never public. The single
// exception is a local `next dev` session started with COA_INCLUDE_TEST_RECORDS=1, so the public flow can be
// exercised end to end with synthetic records in a private environment; NODE_ENV is "production" in every built
// deployment (including Vercel previews), where the flag has no effect.
export function includeTestRecords(): boolean {
  return process.env.NODE_ENV === "development" && process.env.COA_INCLUDE_TEST_RECORDS === "1";
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Whether a lot is currently sold, from the catalog and inventory (unless an administrator set it explicitly):
// available = the product is listed and In Stock, this lot is one of its current lots, and this size has units.
// A lot that has left the product's lot list (or is marked historical) is historical.
export function lotAvailability(record: CoaRecord, product: Product | undefined): LotAvailability {
  if (record.historical) return "historical";
  if (record.inventoryStatus === "available") return "available";
  const lotListed = Boolean(product?.batchNumbers.some((b) => norm(b) === norm(record.lotNumber)));
  if (record.inventoryStatus === "unavailable") return lotListed ? "unavailable" : "historical";
  if (!product || !lotListed) return "historical";
  const remaining = record.sizeLabel ? product.sizeStock?.[record.sizeLabel]?.remaining ?? 0 : product.stock?.remaining ?? 0;
  const sold = product.active !== false && availabilityStatus(product) === "in_stock" && remaining > 0;
  return sold ? "available" : "unavailable";
}

export function toPublic(record: CoaRecord, product: Product | undefined, labs: Laboratory[]): PublicCertificate {
  return {
    id: record.id,
    lotNumber: record.lotNumber ?? "",
    compoundName: (product?.name ?? record.compoundName ?? "Unknown compound") + (record.isTest ? " [TEST DATA]" : ""),
    sizeLabel: record.sizeLabel,
    sku: record.sku,
    productSlug: record.productSlug,
    laboratoryName: record.laboratoryName,
    labReportId: record.labReportId,
    issuedOn: record.issuedOn,
    testedOn: record.testedOn,
    purityResult: record.purityResult,
    quantityResult: record.quantityResult,
    availability: lotAvailability(record, product),
    hasPdf: Boolean(record.fileId),
    // A link the server checked and marked valid, or a laboratory record the check can't read but which meets every
    // fixed condition in lib/coa/lab-record-rules.ts (the same rule that let it be approved). Otherwise no link.
    verificationUrl: record.verificationStatus === "valid" || isUnreadableLabRecord(record, labs) ? record.verificationUrl : null,
  };
}

async function publishedWithProducts(): Promise<{ record: CoaRecord; product: Product | undefined; labs: Laboratory[] }[]> {
  const [records, products, labs] = await Promise.all([
    listPublishedRecords(includeTestRecords()),
    listProducts({ includeInactive: true }).then(withStock),
    listLabs(),
  ]);
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  return records.map((record) => ({ record, product: record.productSlug ? bySlug.get(record.productSlug) : undefined, labs }));
}

// Public certificate search, identical for every visitor (signed in or not — public certificate lookup needs no
// account). Two sources:
//  - certificates: approved, published, non-test records only (publishedWithProducts);
//  - "no published certificate" suggestions for catalog strengths, from the active, on-sale products (the same set
//    customers can buy). Only the name, aliases and strength labels are read into the matcher, plus a SKU built the
//    way certificate SKUs are (lib/coa/admin.ts: slug-strength, upper case). The public suggestion built from them
//    carries compound, strength and SKU only — never price, stock, slug or a link (lib/coa/search.ts).
// The catalog API itself (/api/catalog) stays gated; this reads the product store server-side and returns nothing
// else from it.
export async function searchPublic(q: string): Promise<SearchResult> {
  const [rows, catalog] = await Promise.all([publishedWithProducts(), listProducts()]);
  const items: Searchable[] = rows.map(({ record, product, labs }) => ({ ...toPublic(record, product, labs), aliases: product?.alternateNames ?? [] }));
  const candidates: CatalogCandidate[] = catalog.flatMap((p) => {
    const sizes = pricedSizes(p);
    return (sizes.length ? sizes.map((s) => s.label) : [null]).map((sizeLabel) => ({
      compoundName: p.name,
      aliases: p.alternateNames ?? [],
      productSlug: p.slug,
      sizeLabel,
      sku: sizeLabel ? `${p.slug}-${sizeLabel}`.toUpperCase().replace(/\s+/g, "") : null,
    }));
  });
  return searchCertificates(q, items, new Date().toISOString().slice(0, 10), candidates);
}

// Every published certificate for one lot number (a lot can carry a retest), for the permanent lot page.
export async function publicCertificatesForLot(lot: string): Promise<PublicCertificate[]> {
  const rows = await publishedWithProducts();
  return rows
    .filter(({ record }) => norm(record.lotNumber) === norm(lot))
    .map(({ record, product, labs }) => toPublic(record, product, labs))
    .sort((a, b) => (b.issuedOn ?? "").localeCompare(a.issuedOn ?? ""));
}

// "slug|lot" for every lot with a published certificate — for product pages (link a lot to its certificate) and
// the purity rule (a purity figure is shown only with a published certificate behind the lot customers receive).
// Fails closed: if the certificate tables can't be read, no lot counts as certified (purity figures are hidden and
// lots aren't linked) and the product pages still render.
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

// The record behind a public certificate id, only if it is currently public.
export async function publicRecordById(id: string): Promise<CoaRecord | null> {
  const rows = await publishedWithProducts();
  return rows.find(({ record }) => record.id === id)?.record ?? null;
}
