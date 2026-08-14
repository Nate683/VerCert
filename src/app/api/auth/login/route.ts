import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserByEmail } from "@/lib/users/store";
import { verifyPassword } from "@/lib/users/password";
import { CUSTOMER_SESSION_COOKIE, createCustomerSessionToken } from "@/lib/users/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !body.password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const token = await createCustomerSessionToken(user.id);
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ ok: true });
}
