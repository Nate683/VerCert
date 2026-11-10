import { checkVerificationUrl } from "./verification-url";
import type { CoaRecord, Laboratory } from "./types";

// Laboratory record pages the automatic link check can't read. Pure; client-safe.
//
// Vanguard (verifiedbyvanguard.com) renders each certificate record in the browser: the server returns the same
// small page shell for every URL, so the server-side check (lib/coa/url-check.ts — unchanged) can never find the
// report number on the page and always records "invalid". The link itself works for a person in a browser.
//
// A link that meets EVERY condition below no longer blocks approval (it becomes a warning telling the approver to
// open it and compare), and is shown on the public certificate. The site never calls it confirmed. Anything else
// follows the normal rule: only a link the check marked "valid" may be approved and shown.
//   1. it passes the existing address checks for the record's laboratory (checkVerificationUrl, unchanged);
//   2. the host is exactly verifiedbyvanguard.com — fixed here in code, not the editable laboratory host list;
//      no subdomain, no www, no port;
//   3. the path is exactly /verify/<UUID>, no trailing slash;
//   4. no query string and no fragment;
//   5. the automatic check ran on this link (editing the link resets it to "unchecked") and its ONLY failure was
//      the page-content step: the page loaded with HTTP 200 and stayed on the laboratory's host. An unchecked link,
//      an HTTP error, a timeout or a redirect off the site still blocks.

const VANGUARD_HOST = "verifiedbyvanguard.com";
const VANGUARD_RECORD_PATH = /^\/verify\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The exact note lib/coa/url-check.ts records when the page loaded (HTTP 200, on the laboratory's host) but didn't
// contain the report or lot number. Copied, not imported, so the checker stays untouched. If that wording ever
// changes, this no longer matches and Vanguard links go back to blocking approval: it fails safe.
const CONTENT_ONLY_FAILURE = "The page loads but doesn't show this certificate's report or lot number, so it can't be confirmed as this record.";

/** Conditions 2–4: the URL is a Vanguard per-certificate record address. */
export function isVanguardRecordUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname.toLowerCase() === VANGUARD_HOST &&
    url.port === "" &&
    !url.username &&
    !url.password &&
    VANGUARD_RECORD_PATH.test(url.pathname) &&
    url.search === "" &&
    url.hash === "" &&
    // URL() drops an empty "?" or "#"; the raw text must not carry one either.
    !/[?#]/.test(raw)
  );
}

/** All five conditions: a client-rendered laboratory record that may be approved and shown unconfirmed. */
export function isUnreadableLabRecord(
  record: Pick<CoaRecord, "verificationUrl" | "verificationStatus" | "verificationNote" | "verificationCheckedAt" | "labReportId" | "lotNumber" | "laboratoryId">,
  labs: Pick<Laboratory, "id" | "name" | "verificationHosts">[]
): boolean {
  if (!record.verificationUrl) return false;
  const lab = labs.find((l) => l.id === record.laboratoryId) ?? null;
  if (!checkVerificationUrl(record.verificationUrl, lab, record).ok) return false;
  if (!isVanguardRecordUrl(record.verificationUrl)) return false;
  return record.verificationStatus === "invalid" && Boolean(record.verificationCheckedAt) && record.verificationNote === CONTENT_ONLY_FAILURE;
}
