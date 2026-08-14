import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createUser, getUserByEmail } from "@/lib/users/store";
import { hashPassword, generateToken } from "@/lib/users/password";
import { CUSTOMER_SESSION_COOKIE, createCustomerSessionToken } from "@/lib/users/session";
import { sendMail } from "@/lib/email";
import { isHouseAccountEmail } from "@/lib/executive/house-account";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(request: Request) {
  let body: { email?: string; password?: string; marketingOptIn?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (isHouseAccountEmail(email)) {
    return NextResponse.json({ error: "This email address is unavailable." }, { status: 409 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (await getUserByEmail(email)) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);
  const verificationToken = generateToken();
  const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();

  const user = await createUser({
    email,
    passwordHash,
    marketingOptIn: Boolean(body.marketingOptIn),
    verificationToken,
    verificationTokenExpiresAt,
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const verifyUrl = `${siteUrl}/api/auth/verify-email?token=${verificationToken}`;
  try {
    await sendMail(
      user.email,
      "Verify your VeriCert account",
      `Welcome to VeriCert.\n\nPlease verify your email address by visiting:\n${verifyUrl}\n\nThis link expires in 24 hours.`
    );
  } catch (err) {
    console.error("Failed to send verification email:", err);
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
