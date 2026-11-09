import { checkVerificationUrl } from "./verification-url";
import type { CoaRecord, Laboratory, VerificationStatus } from "./types";

// Server-side check of a laboratory verification link. A link becomes "valid" only here:
// 1. it passes the structural rules (https, a host recorded for this laboratory, a specific record — not a
//    homepage or search page, lib/coa/verification-url.ts);
// 2. the page loads (HTTP 200), and still on one of the laboratory's hosts after any redirects;
// 3. this certificate is identified: its report or lot number is in the link, or on the page the link opens.
// Only hosts an administrator recorded for the laboratory are ever fetched.

export async function checkLinkLive(
  record: Pick<CoaRecord, "verificationUrl" | "labReportId" | "lotNumber">,
  lab: Laboratory | null,
  fetchImpl: typeof fetch = fetch
): Promise<{ status: VerificationStatus; note: string }> {
  if (!record.verificationUrl) return { status: "none", note: "No link." };
  const structural = checkVerificationUrl(record.verificationUrl, lab, record);
  if (!structural.ok) return { status: "invalid", note: structural.reason };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetchImpl(record.verificationUrl, { redirect: "follow", signal: controller.signal, headers: { accept: "text/html,application/pdf;q=0.9,*/*;q=0.5" } });
    if (res.status !== 200) return { status: "invalid", note: `The link returned HTTP ${res.status}.` };
    const finalHost = new URL(res.url || record.verificationUrl).hostname.toLowerCase();
    if (!lab!.verificationHosts.some((h) => finalHost === h.toLowerCase() || finalHost.endsWith(`.${h.toLowerCase()}`))) {
      return { status: "invalid", note: `The link redirected off the laboratory's site (to ${finalHost}).` };
    }
    if (structural.identifierInUrl) return { status: "valid", note: "Loads, on the laboratory's verification host, and the link carries this certificate's number." };
    const body = (await res.text()).slice(0, 1_000_000).toLowerCase();
    const ids = [record.labReportId, record.lotNumber].filter((x): x is string => Boolean(x));
    if (ids.some((id) => body.includes(id.toLowerCase()))) return { status: "valid", note: "Loads, on the laboratory's verification host, and the page shows this certificate's number." };
    return { status: "invalid", note: "The page loads but doesn't show this certificate's report or lot number, so it can't be confirmed as this record." };
  } catch (err) {
    return { status: "invalid", note: controller.signal.aborted ? "The laboratory's site didn't respond within 10 seconds." : `The link couldn't be opened (${err instanceof Error ? err.message : "network error"}).` };
  } finally {
    clearTimeout(timer);
  }
}
