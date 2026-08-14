import { NextResponse } from "next/server";
import { getUserByResetToken, updateUser } from "@/lib/users/store";
import { hashPassword } from "@/lib/users/password";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const POST = withApiErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`reset-password:${ip}`, { limit: 10, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  let body: { token?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.token || !body.password || body.password.length < 8) {
    return NextResponse.json(
      { error: "A valid token and a password of at least 8 characters are required." },
      { status: 400 }
    );
  }

  const user = await getUserByResetToken(body.token);
  if (
    !user ||
    !user.resetTokenExpiresAt ||
    new Date(user.resetTokenExpiresAt).getTime() < Date.now()
  ) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const passwordHash = await hashPassword(body.password);
  await updateUser(user.id, {
    passwordHash,
    resetToken: undefined,
    resetTokenExpiresAt: undefined,
  });

  return NextResponse.json({ ok: true });
});
