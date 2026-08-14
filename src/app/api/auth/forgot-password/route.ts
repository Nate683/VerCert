import { NextResponse } from "next/server";
import { getUserByEmail, updateUser } from "@/lib/users/store";
import { generateToken } from "@/lib/users/password";
import { sendMail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`forgot-password:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  // Always return success — don't reveal whether an account exists.
  if (email) {
    const user = await getUserByEmail(email);
    if (user) {
      const resetToken = generateToken();
      const resetTokenExpiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
      await updateUser(user.id, { resetToken, resetTokenExpiresAt });

      const siteUrl = getSiteUrl();
      const resetUrl = `${siteUrl}/reset-password?token=${resetToken}`;
      try {
        await sendMail(
          user.email,
          "Reset your VeriCert password",
          `We received a request to reset your password.\n\nVisit this link to choose a new password:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`
        );
      } catch (err) {
        console.error("Failed to send password reset email:", err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
