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

// One certificate as the public sees it: only fields printed on the certificate or held in the catalog.
export type PublicCertificate = {
  id: string;
  lotNumber: string;
  compoundName: string;
  sizeLabel: string | null;
  sku: string | null;
  productSlug: string | null;
  laboratoryName: string | null;
  labReportId: string | null;
  issuedOn: string | null;
  testedOn: string | null;
  purityResult: string | null;
  quantityResult: string | null;
  availability: LotAvailability;
  hasPdf: boolean;
  verificationUrl: string | null; // only a validated, exact laboratory record
};
