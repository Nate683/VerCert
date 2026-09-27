import { NextResponse } from "next/server";
import { getUserByEmail, createUser, setMarketingConsent } from "@/lib/users/store";
import { hashPassword, generateToken } from "@/lib/users/password";
import { getRealmForEmail } from "@/lib/executive/staff";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lightweight email capture — reuses the same Customer record + marketing consent
// field as full signup, without requiring a password up front.
export const POST = withApiErrorHandling(async (request: Request) => {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || getRealmForEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    await setMarketingConsent(existing.id, true, "newsletter_signup");
  } else {
    const passwordHash = await hashPassword(generateToken());
    await createUser({
      email,
      passwordHash,
      marketingConsent: true,
      marketingConsentSource: "newsletter_signup",
      verificationToken: generateToken(),
      verificationTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  return NextResponse.json({ ok: true });
});
