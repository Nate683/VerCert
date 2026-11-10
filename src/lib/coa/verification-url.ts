import type { Laboratory } from "./types";

// Laboratory verification links. Client-safe (pure).
//
// A verification URL is only ever one an administrator entered or one printed in the certificate itself — the
// system never builds one. To count as valid it must be:
// - https, with no credentials, no whitespace or control characters;
// - on a host the laboratory is recorded as publishing verification records on (coa_laboratories);
// - a specific record, not the site's homepage or a search page: it must have a path beyond "/" and must not be a
//   bare search URL (a path ending in /search or a query holding nothing but a search term);
// - and it must identify this certificate: the laboratory report number or the VeriCert lot number appears in the
//   link itself, or (checked on the server, lib/coa/url-check.ts) on the page the link opens.
// Anything else is invalid: it blocks approval (lib/coa/validate.ts) and is never shown publicly; a certificate
// without a usable link simply shows no verification link. The one exception, a Vanguard record page the server
// check can't read, is defined in lib/coa/lab-record-rules.ts.
// This function is the structural part; a link is only marked valid after the server-side check.

export type UrlCheck = { ok: true; identifierInUrl: boolean } | { ok: false; reason: string };

export function checkVerificationUrl(
  raw: string,
  lab: Pick<Laboratory, "name" | "verificationHosts"> | null,
  identifiers: { labReportId: string | null; lotNumber: string | null }
): UrlCheck {
  if (!raw || /[\s\u0000-\u001F\u007F\\]/.test(raw)) return { ok: false, reason: "The link is empty or contains spaces or control characters." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "That isn't a valid web address." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Verification links must use https://." };
  if (url.username || url.password) return { ok: false, reason: "Links with embedded credentials aren't allowed." };
  if (!lab) return { ok: false, reason: "Choose the laboratory first: a link is checked against that laboratory's verification hosts." };
  const host = url.hostname.toLowerCase();
  const hosts = lab.verificationHosts.map((h) => h.toLowerCase());
  if (hosts.length === 0) return { ok: false, reason: `No verification host is recorded for ${lab.name}. Add the host the laboratory publishes certificate records on.` };
  if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { ok: false, reason: `${host} isn't a verification host recorded for ${lab.name} (${hosts.join(", ")}).` };
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "") return { ok: false, reason: "That's the laboratory's homepage, not a certificate record." };
  if (/\/search$/i.test(path)) return { ok: false, reason: "That's a search page, not the certificate's own record." };
  const ids = [identifiers.labReportId, identifiers.lotNumber].filter((x): x is string => Boolean(x && x.trim()));
  const haystack = decodeURIComponent(url.pathname + url.search + url.hash).toLowerCase();
  if (ids.length === 0) return { ok: false, reason: "Enter the laboratory report number first; the link has to identify this certificate." };
  return { ok: true, identifierInUrl: ids.some((id) => haystack.includes(id.trim().toLowerCase())) };
}
