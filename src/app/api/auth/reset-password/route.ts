import { NextResponse } from "next/server";
import { getUserByResetToken, updateUser } from "@/lib/users/store";
import { hashPassword } from "@/lib/users/password";
import { passwordProblem } from "@/lib/users/password-policy";
import { resetPasswordSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const POST = withApiErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`reset-password:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, resetPasswordSchema);
  if ("error" in parsed) return parsed.error;
  const { token, password } = parsed.data;

  const user = await getUserByResetToken(token);
  if (
    !user ||
    !user.resetTokenExpiresAt ||
    new Date(user.resetTokenExpiresAt).getTime() < Date.now()
  ) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const weakPassword = await passwordProblem(password, {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  });
  if (weakPassword) return NextResponse.json({ error: weakPassword }, { status: 400 });

  const passwordHash = await hashPassword(password);
  await updateUser(user.id, {
    passwordHash,
    resetToken: undefined,
    resetTokenExpiresAt: undefined,
  });

  return NextResponse.json({ ok: true });
});
