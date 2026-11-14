// COA verification: record shapes and status vocabularies. Client-safe (no database access).
//
// Separate states, never collapsed into one another:
// - review_status:     has an administrator reviewed the extracted fields? (needs_review | reviewed)
// - approval_status:   did an authorized administrator approve or reject the lot? (pending | approved | rejected)
// - public_visibility: is it published to customers? (hidden | public) — only an approved record can be public
// - inventory_status:  is the lot currently sold? (auto = derived from the catalog and inventory)
// - historical:        explicitly marked as a past lot (sold out / disposed)
// An uploaded PDF is none of these: it creates a record that needs review, is pending, and is hidden.

export const REVIEW_STATUSES = ["needs_review", "reviewed"] as const;
export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export const VISIBILITY = ["hidden", "public"] as const;
export const INVENTORY_STATUSES = ["auto", "available", "unavailable"] as const;
export const VERIFICATION_STATUSES = ["none", "unchecked", "valid", "invalid"] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type Visibility = (typeof VISIBILITY)[number];
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

// One test on a certificate. A test that is not on the certificate is never a pass.
export const TEST_STATUSES = ["passed", "failed", "not_performed", "pending", "unavailable", "requires_review"] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];
export const TEST_STATUS_LABELS: Record<TestStatus, string> = {
  passed: "Passed",
  failed: "Failed",
  not_performed: "Not performed",
  pending: "Pending",
  unavailable: "Unavailable",
  requires_review: "Requires review",
};

// The additional tests the system knows by name. Others can be recorded with a free-text name.
export const KNOWN_TESTS = [
  { key: "identity", name: "Identity" },
  { key: "sterility", name: "Sterility" },
  { key: "endotoxins", name: "Bacterial endotoxins" },
  { key: "heavy_metals", name: "Heavy metals" },
  { key: "fentanyl", name: "Fentanyl" },
  { key: "tfa", name: "TFA (trifluoroacetic acid)" },
  { key: "residual_solvents", name: "Residual solvents" },
] as const;

export type TestResult = {
  key: string; // a KNOWN_TESTS key, or a slug of a free-text name
  name: string;
  method: string | null;
  result: string | null; // exactly as printed on the certificate
  status: TestStatus;
};

export type CoaRecord = {
  id: string;
  lotNumber: string | null; // the VeriCert lot number — not the laboratory's report number; empty until known
  productSlug: string | null;
  compoundName: string | null;
  sizeLabel: string | null; // the strength, e.g. "10mg"
  sku: string | null;
  inventoryLot: string | null; // the lot as held in the catalog (products.batch_numbers), once matched
  laboratoryId: string | null;
  laboratoryName: string | null;
  labReportId: string | null; // the laboratory's own report / certificate number
  testedOn: string | null; // YYYY-MM-DD
  issuedOn: string | null; // YYYY-MM-DD
  purityResult: string | null; // as printed
  purityPercent: number | null; // parsed from purityResult
  quantityResult: string | null; // as printed
  quantityMg: number | null; // parsed from quantityResult
  appearance: string | null;
  testResults: TestResult[];
  fileId: string | null;
  verificationUrl: string | null;
  verificationStatus: VerificationStatus;
  verificationNote: string | null;
  verificationCheckedAt: string | null;
  extraction: ExtractionReport | null;
  reviewStatus: ReviewStatus;
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  publicVisibility: Visibility;
  inventoryStatus: InventoryStatus;
  historical: boolean;
  dispositionOn: string | null;
  isTest: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  approvedAt: string | null;
  approvedBy: string | null;
  // The deliberate PUBLISH (public_visibility = public is set in the same statement).
  publishedAt: string | null;
  publishedBy: string | null;
  // A person opened the laboratory link and confirmed it shows this report. Valid only while the stored URL and
  // report number still equal what was confirmed (linkConfirmed()).
  linkConfirmedUrl: string | null;
  linkConfirmedBy: string | null;
  linkConfirmedAt: string | null;
  linkConfirmedReportId: string | null;
  // Advisory quality warnings the owner acknowledged (code + exact message), so a changed finding needs a new one.
  warningsAcknowledged: AcknowledgedWarning[];
  warningsAcknowledgedBy: string | null;
  warningsAcknowledgedAt: string | null;
  // Recoverable deletion: never public once set.
  deletedAt: string | null;
  deletedBy: string | null;
  // Fields an administrator set by hand. Extraction never overwrites them.
  manualFields: string[];
};

export type AcknowledgedWarning = { code: string; message: string };

// A lot's immutable chronology (coa_lots): when the lot number was first uploaded.
export type CoaLot = {
  id: string;
  lotKey: string;
  lotNumber: string;
  productSlug: string | null;
  sizeLabel: string | null;
  firstUploadedAt: string;
  chronologySource: "upload" | "backfill";
  needsReview: boolean;
  reviewNote: string | null;
};

// A pending correction (new PDF) or edit (field changes) to a published report. The published version stays public
// until the revision is published.
export type CoaRevision = {
  id: string;
  recordId: string;
  kind: "correction" | "edit";
  fileId: string | null;
  patch: Record<string, unknown>;
  status: "pending" | "published" | "discarded";
  previous: Record<string, unknown> | null;
  createdAt: string;
  createdBy: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

// QUALITY ALERT — REVIEW INVENTORY: open until an administrator acknowledges it.
export type InventoryAlert = {
  id: string;
  recordId: string;
  productSlug: string | null;
  sizeLabel: string | null;
  lotNumber: string | null;
  reason: string;
  details: unknown;
  createdAt: string;
  createdBy: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgmentNote: string | null;
};

// What extraction found, field by field, with the exact text it came from. Values that could not be found in the
// document's text are not stored as values — they are listed in `missing` or `rejected` for the administrator.
export type ExtractionReport = {
  method: "ai" | "rules" | "none";
  model: string | null;
  at: string;
  pageCount: number | null;
  hasTextLayer: boolean;
  found: Record<string, { value: string; source: string }>;
  missing: string[];
  rejected: { field: string; value: string; reason: string }[];
  notes: string[];
};

export type Laboratory = {
  id: string;
  name: string;
  verificationHosts: string[]; // hosts on which this laboratory publishes per-certificate verification records
  accreditationNote: string | null;
};

export type AcceptanceCriteria = {
  productSlug: string; // '*' = default
  applies: boolean;
  minPurityPercent: number | null;
  quantityMinPercent: number | null;
  quantityMaxPercent: number | null;
  requiredTests: string[];
};

// Availability of a lot as customers see it.
export type LotAvailability = "available" | "unavailable" | "historical";
export const LOT_AVAILABILITY_LABELS: Record<LotAvailability, string> = {
  available: "Currently available",
  unavailable: "Approved — not currently in stock",
  historical: "Historical lot",
};

// One published laboratory report as the public sees it. Deliberately no analytical values (purity, quantity,
// endotoxins, sterility…): the customer reads the full report through the two verification links. Those values are
// kept for the later product-page phase.
export type PublicReport = {
  id: string;
  lotNumber: string;
  laboratoryName: string | null;
  labReportId: string | null;
  testedOn: string | null;
  issuedOn: string | null;
  testing: "original" | "retest" | null; // only where the dates support it
  pdfUrl: string; // VERIFY VERICERT COA — the original laboratory PDF, served by VeriCert
  verificationUrl: string | null; // VERIFY WITH [LABORATORY] — the exact stored, manually confirmed laboratory URL
};

export type PublicLot = { lotNumber: string; reports: PublicReport[] };

// One product + strength: its current lot and its historical lots (lib/coa/chronology.ts).
export type CertificateGroup = {
  key: string;
  compoundName: string;
  sizeLabel: string | null;
  sku: string | null;
  current: PublicLot | null;
  historical: PublicLot[];
  matchedLots: string[]; // lot numbers the query matched (to point the customer at them); empty for a name search
  preview?: boolean; // administrative PREVIEW / NOT PUBLIC only — never set on public results
};
