import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createUser, getUserByEmail } from "@/lib/users/store";
import { hashPassword, generateToken } from "@/lib/users/password";
import { CUSTOMER_SESSION_COOKIE, createCustomerSessionToken } from "@/lib/users/session";
import { sendMail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { getRealmForEmail } from "@/lib/executive/staff";
import { getInviteCodeByCode, createAffiliate, markInviteCodeUsed, getTierInfo } from "@/lib/affiliates";
import { signupSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const POST = withApiErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`signup:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, signupSchema);
  if ("error" in parsed) return parsed.error;
  const { name, email, password, marketingOptIn, isAffiliate, inviteCode } = parsed.data;

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

  // Validate the invite code BEFORE creating anything, so an invalid code
  // never leaves behind a half-created account.
  let inviteRow: Awaited<ReturnType<typeof getInviteCodeByCode>> = null;
  if (isAffiliate) {
    if (!inviteCode?.trim()) {
      return NextResponse.json(
        { error: "An invite code is required to sign up as an affiliate.", invalidCode: true },
        { status: 400 }
      );
    }
    inviteRow = await getInviteCodeByCode(inviteCode);
    if (!inviteRow || inviteRow.usedAt) {
      return NextResponse.json(
        { error: "That invite code isn't valid or has already been used.", invalidCode: true },
        { status: 400 }
      );
    }
    if (inviteRow.boundEmail && inviteRow.boundEmail !== email.toLowerCase()) {
      return NextResponse.json(
        { error: "That invite code is reserved for a different email address.", invalidCode: true },
        { status: 400 }
      );
    }
  }

  const passwordHash = await hashPassword(password);
  const verificationToken = generateToken();
  const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();

  const user = await createUser({
    email,
    name,
    passwordHash,
    marketingOptIn: Boolean(marketingOptIn),
    verificationToken,
    verificationTokenExpiresAt,
  });

  let affiliateCode: string | null = null;
  if (inviteRow) {
    const tierInfo = getTierInfo(inviteRow.tier);
    const affiliate = await createAffiliate({
      name,
      email,
      commissionType: "percent",
      commissionRate: tierInfo?.commissionRate ?? 0,
      code: inviteRow.code,
      customerDiscountPercent: inviteRow.customerDiscountPercent,
      tier: inviteRow.tier,
    });
    await markInviteCodeUsed(inviteRow.id, affiliate.id);
    await logActivity(email, "affiliate.signup_via_invite", inviteRow.code);
    affiliateCode = inviteRow.code;
  }

  const siteUrl = getSiteUrl();
  const verifyUrl = `${siteUrl}/api/auth/verify-email?token=${verificationToken}`;
  const text = affiliateCode
    ? [
        `Welcome to VeriCert.`,
        "",
        `Please verify your email address by visiting:`,
        verifyUrl,
        "",
        `This link expires in 24 hours.`,
        "",
        `You're also set up as a VeriCert affiliate. Your referral code is: ${affiliateCode}`,
        `View your production and commission dashboard any time at ${siteUrl}/partner`,
      ].join("\n")
    : `Welcome to VeriCert.\n\nPlease verify your email address by visiting:\n${verifyUrl}\n\nThis link expires in 24 hours.`;
  try {
    await sendMail(user.email, "Verify your VeriCert account", text);
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

  return NextResponse.json({ ok: true, isAffiliate: Boolean(affiliateCode) });
});

