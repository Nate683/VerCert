import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getExecutiveCookieName, type ExecutiveRealm } from "@/lib/executive/auth";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/users/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { realm?: ExecutiveRealm };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const cookieStore = await cookies();
  if (body.realm === "command" || body.realm === "office") {
    cookieStore.delete(getExecutiveCookieName(body.realm));
    // Ends the storefront session that was opened alongside the terminal login.
    cookieStore.delete(CUSTOMER_SESSION_COOKIE);
  }

  return NextResponse.json({ ok: true });
}
