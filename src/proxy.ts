import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getExecutiveCookieName,
  verifyExecutiveSessionToken,
  type ExecutiveRealm,
} from "@/lib/executive/auth";

const REALMS: ExecutiveRealm[] = ["command", "office"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const realm = REALMS.find((r) => pathname === `/${r}` || pathname.startsWith(`/${r}/`));
  if (!realm) return NextResponse.next();

  if (pathname === `/${realm}/login`) return NextResponse.next();

  const token = request.cookies.get(getExecutiveCookieName(realm))?.value;
  const authed = await verifyExecutiveSessionToken(realm, token);

  if (!authed) {
    return NextResponse.redirect(new URL(`/${realm}/login`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/command/:path*", "/office/:path*"],
};
