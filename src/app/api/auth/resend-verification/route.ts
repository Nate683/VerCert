import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { updateUser } from "@/lib/users/store";
import { generateToken } from "@/lib/users/password";
import { sendMail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export const POST = withApiErrorHandling(async () => {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (user.emailVerified) return NextResponse.json({ ok: true });

  const verificationToken = generateToken();
  const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
  await updateUser(user.id, { verificationToken, verificationTokenExpiresAt });

  const siteUrl = getSiteUrl();
  const verifyUrl = `${siteUrl}/api/auth/verify-email?token=${verificationToken}`;
  try {
    await sendMail(
      user.email,
      "Verify your VeriCert account",
      `Please verify your email address by visiting:\n${verifyUrl}\n\nThis link expires in 24 hours.`
    );
  } catch (err) {
    console.error("Failed to send verification email:", err);
  }

  return NextResponse.json({ ok: true });
});
