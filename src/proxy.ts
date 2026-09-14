import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/users/session";

const REALMS = ["command", "office"] as const;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const realm = REALMS.find((r) => pathname === `/${r}` || pathname.startsWith(`/${r}/`));
  if (!realm) return NextResponse.next();

  // Only checks the signed session cookie here (Edge-safe, no fs access) —
  // the page itself verifies the `role` matches this realm. Everyone allowed
  // into a realm has to have passed two-factor, so a session without that
  // mark is sent back to sign in before the page even runs.
  const token = request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
  const session = await verifyCustomerSessionToken(token);

  if (!session?.twoFactorVerified) {
    return NextResponse.redirect(new URL(`/login?next=/${realm}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/command/:path*", "/office/:path*"],
};
