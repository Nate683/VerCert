import type { NextRequest, NextResponse } from "next/server";
import type { Attribution } from "@/lib/types";

// First-touch marketing attribution: how a visitor originally found the site —
// an affiliate's referral link (?ref=CODE), campaign tags (utm_*), or the site
// that linked here. The proxy records it on arrival, with no form and no client
// script, and registration copies it onto the new account.
export const ATTRIBUTION_COOKIE = "vericert_attribution";
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

function clip(value: string | null, max = 100): string | undefined {
  return value?.trim().slice(0, max) || undefined;
}

function encodeAttribution(attribution: Attribution): string {
  return Buffer.from(JSON.stringify(attribution)).toString("base64url");
}

export function decodeAttribution(value: string | undefined): Attribution | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Attribution) : null;
  } catch {
    return null;
  }
}

function externalReferrer(request: NextRequest): string | undefined {
  const header = request.headers.get("referer");
  if (!header) return undefined;
  try {
    const host = new URL(header).hostname;
    return host && host !== request.nextUrl.hostname ? host.slice(0, 100) : undefined;
  } catch {
    return undefined;
  }
}

// Records the first arrival worth recording. The one exception to first-touch:
// an affiliate referral replaces an earlier attribution that had no affiliate,
// so the affiliate still gets credit for a visitor who once found us unaided.
export function captureAttribution(request: NextRequest, response: NextResponse): void {
  const params = request.nextUrl.searchParams;
  const ref = clip(params.get("ref"), 40)?.toUpperCase();
  const utmSource = clip(params.get("utm_source"));
  const utmMedium = clip(params.get("utm_medium"));
  const utmCampaign = clip(params.get("utm_campaign"));
  const referrer = externalReferrer(request);
  if (!ref && !utmSource && !utmMedium && !utmCampaign && !referrer) return;

  const existing = decodeAttribution(request.cookies.get(ATTRIBUTION_COOKIE)?.value);
  if (existing && (existing.ref || !ref)) return;

  const attribution: Attribution = {
    ref,
    utmSource,
    utmMedium,
    utmCampaign,
    referrer,
    landingPath: request.nextUrl.pathname,
    firstSeenAt: new Date().toISOString(),
  };
  response.cookies.set(ATTRIBUTION_COOKIE, encodeAttribution(attribution), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}
