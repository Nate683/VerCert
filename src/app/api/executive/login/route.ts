import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createExecutiveSessionToken,
  getExecutiveCookieName,
  verifyExecutivePassword,
  type ExecutiveRealm,
} from "@/lib/executive/auth";
import { getOrCreateHouseAccount } from "@/lib/executive/house-account";
import { CUSTOMER_SESSION_COOKIE, createCustomerSessionToken } from "@/lib/users/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { realm?: ExecutiveRealm; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { realm, password } = body;
  if (realm !== "command" && realm !== "office") {
    return NextResponse.json({ error: "Invalid terminal." }, { status: 400 });
  }
  if (!password || !verifyExecutivePassword(realm, password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = await createExecutiveSessionToken(realm);
  const cookieStore = await cookies();
  cookieStore.set(getExecutiveCookieName(realm), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  // Signing into a terminal also authenticates that person on the storefront
  // so they can browse and shop normally while logged in.
  const houseAccount = await getOrCreateHouseAccount(realm);
  const customerToken = await createCustomerSessionToken(houseAccount.id);
  cookieStore.set(CUSTOMER_SESSION_COOKIE, customerToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });


  return NextResponse.json({ ok: true });
}
