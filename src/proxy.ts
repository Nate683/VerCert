import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/users/session";
import { captureAttribution } from "@/lib/marketing/attribution";

const REALMS = ["command", "office"] as const;

// Storefront pages a signed-out visitor may see. The catalog, product pages,
// COA lookup, cart, checkout and everything else need an account — and so
// does any page added later, until it's listed here.
const PUBLIC_PAGES = new Set([
  "/",
  "/about",
  "/how-we-test",
  "/contact",
  "/privacy-policy",
  "/terms",
  "/refund-policy",
  "/shipping-policy",
]);

// Signing in, registering, and the links sent by email must work signed out.
const AUTH_PAGES = new Set([
  "/login",
  "/register",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-email-change",
  "/two-factor",
  "/unsubscribe",
]);

// Sections that handle their own sign-in. /command and /office are checked
// separately below.
const OWN_AUTH_SECTIONS = ["/account", "/hq", "/partner", "/affiliate"];

// API routes that are public or check auth themselves. The rest — catalog,
// COA lookup, promo validation, orders — need a signed-in customer.
const UNGATED_API = [
  "/api/auth",
  "/api/account",
  "/api/webhooks",
  "/api/track",
  "/api/contact",
  "/api/subscribe",
  "/api/hq",
  "/api/executive",
];

const within = (pathname: string, section: string) =>
  pathname === section || pathname.startsWith(`${section}/`);

function isUngated(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return UNGATED_API.some((section) => within(pathname, section));
  return (
    PUBLIC_PAGES.has(pathname) ||
    AUTH_PAGES.has(pathname) ||
    OWN_AUTH_SECTIONS.some((section) => within(pathname, section))
  );
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;

  const realm = REALMS.find((r) => within(pathname, `/${r}`));
  if (realm) {
    // Only checks the signed session cookie here (Edge-safe, no fs access) —
    // the page itself verifies the `role` matches this realm. Everyone allowed
    // into a realm has to have passed two-factor, so a session without that
    // mark is sent back to sign in before the page even runs.
    const session = await verifyCustomerSessionToken(token);
    if (!session?.twoFactorVerified) {
      return NextResponse.redirect(new URL(`/login?next=/${realm}`, request.url));
    }
    return NextResponse.next();
  }

  const isApi = pathname.startsWith("/api/");
  let response: NextResponse;
  if (isUngated(pathname) || (await verifyCustomerSessionToken(token))) {
    response = NextResponse.next();
  } else if (isApi) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  } else {
    const register = new URL("/register", request.url);
    register.searchParams.set("next", `${pathname}${search}`);
    response = NextResponse.redirect(register);
  }

  // Recorded before any redirect goes out, which would otherwise drop a ?ref=
  // or utm_ tag on the gated page the visitor landed on.
  if (!isApi) captureAttribution(request, response);
  return response;
}

export const config = {
  // Every route except Next's own assets, files with an extension (images,
  // fonts, robots.txt, sitemap.xml) and the generated share image.
  matcher: ["/((?!_next/static|_next/image|opengraph-image|.*\\..*).*)"],
};
