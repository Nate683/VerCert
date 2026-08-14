import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createUser, getUserByEmail } from "@/lib/users/store";
import { hashPassword, generateToken } from "@/lib/users/password";
import { CUSTOMER_SESSION_COOKIE, createCustomerSessionToken } from "@/lib/users/session";
import { sendMail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { getRealmForEmail } from "@/lib/executive/staff";
import { signupSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`signup:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, signupSchema);
  if ("error" in parsed) return parsed.error;
  const { email, password, marketingOptIn } = parsed.data;

  if (getRealmForEmail(email)) {
    return NextResponse.json(
      { error: "This account already exists — sign in instead." },
      { status: 409 }
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
    marketingOptIn: Boolean(marketingOptIn),
    verificationToken,
    verificationTokenExpiresAt,
  });

  const siteUrl = getSiteUrl();
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
