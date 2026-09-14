import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createUser, getUserByEmail } from "@/lib/users/store";
import { hashPassword, generateToken } from "@/lib/users/password";
import { setCustomerSessionCookie } from "@/lib/users/session-cookie";
import { sendMail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { getRealmForEmail } from "@/lib/executive/staff";
import {
  getInviteCodeByCode,
  createAffiliate,
  markInviteCodeUsed,
  getTierInfo,
  getAffiliateByReferralCode,
} from "@/lib/affiliates";
import { ATTRIBUTION_COOKIE, decodeAttribution } from "@/lib/marketing/attribution";
import { AGE_GATE_COOKIE } from "@/lib/age-gate";
import { registerSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const POST = withApiErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`signup:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, registerSchema);
  if ("error" in parsed) return parsed.error;
  const { firstName, lastName, email, password, company, heardAbout, marketingOptIn, isAffiliate, inviteCode } =
    parsed.data;

  // The storefront age gate is the site's 21+ attestation. It appears before
  // this form ever does; this check stops an account skipping it, and the
  // account records when it was given.
  const cookieStore = await cookies();
  if (cookieStore.get(AGE_GATE_COOKIE)?.value !== "1") {
    return NextResponse.json(
      { error: "Please confirm you're 21 or older before creating an account.", ageGate: true },
      { status: 400 }
    );
  }

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

  // Where the visitor first came from, recorded by the proxy on arrival. A
  // referral code only credits an active affiliate, and never applies to
  // someone signing up as an affiliate themselves.
  const attribution = decodeAttribution(cookieStore.get(ATTRIBUTION_COOKIE)?.value) ?? undefined;
  const referrer = attribution?.ref && !inviteRow ? await getAffiliateByReferralCode(attribution.ref) : null;

  const name = `${firstName} ${lastName}`;
  const verificationToken = generateToken();
  const user = await createUser({
    email,
    name,
    firstName,
    lastName,
    company: company || undefined,
    heardAbout,
    passwordHash: await hashPassword(password),
    marketingOptIn: Boolean(marketingOptIn),
    verificationToken,
    verificationTokenExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MS).toISOString(),
    ageAttestedAt: new Date().toISOString(),
    affiliateId: referrer?.id,
    attribution,
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
  const lines = [
    `Welcome to VeriCert, ${firstName}.`,
    "",
    "Please verify your email address by visiting:",
    verifyUrl,
    "",
    "This link expires in 24 hours.",
  ];
  if (affiliateCode) {
    lines.push(
      "",
      `You're also set up as a VeriCert affiliate. Your referral code is: ${affiliateCode}`,
      `View your production and commission dashboard any time at ${siteUrl}/partner`
    );
  }
  try {
    await sendMail(user.email, "Verify your VeriCert account", lines.join("\n"));
  } catch (err) {
    console.error("Failed to send verification email:", err);
  }

  await setCustomerSessionCookie(user.id);
  return NextResponse.json({ ok: true, isAffiliate: Boolean(affiliateCode) });
});
