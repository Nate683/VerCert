// Batch lookups go to the testing laboratory's public certificate search,
// Verified by Vanguard. Every lookup form on the site uses this one handler.
//
// OFF unless NEXT_PUBLIC_COA_LOOKUP_ENABLED=1. Checked on 2026-10-18: the
// spec's URL form (https://verifiedbyvanguard.com/<lot>) renders the site's
// own "404 Page Not Found", and the working search below returned "No
// certificates found" for VeriCert, VeriCert Peptides and RKNEA. No product
// has a lot number yet either. With the flag off, no lookup form renders —
// a verify button that opens an empty result is worse than none. Turn it on
// once VeriCert's certificates are published there.
//
// Client-safe: NEXT_PUBLIC_ values are inlined at build time, so changing the
// flag needs a redeploy.
export const COA_LOOKUP_ENABLED = process.env.NEXT_PUBLIC_COA_LOOKUP_ENABLED === "1";

// The brand name as printed on our certificates; Vanguard's search requires it.
const BRAND = "VeriCert Peptides";

export function coaLookupUrl(lotNumber: string): string {
  return `https://verifiedbyvanguard.com/search?brand=${encodeURIComponent(BRAND)}&q=${encodeURIComponent(lotNumber.trim())}`;
}

// Opens the laboratory's record for a lot in a new tab.
export function openCoaLookup(lotNumber: string): void {
  window.open(coaLookupUrl(lotNumber), "_blank", "noopener,noreferrer");
}
