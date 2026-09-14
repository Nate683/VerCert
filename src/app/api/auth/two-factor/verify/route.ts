import { NextResponse } from "next/server";
import {
  challengeExpiredResponse,
  checkTwoFactorRateLimit,
  completeTwoFactorSignIn,
  getTwoFactorChallengeUser,
} from "@/lib/two-factor/challenge";
import { consumeBackupCode, verifyTotpCode } from "@/lib/two-factor/store";
import { twoFactorVerifySchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

// Second step of sign-in for an enrolled account: an authenticator code, or
// one of the backup codes issued at enrollment. Failures are written to the
// activity log so repeated attempts show up in /command.
export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await getTwoFactorChallengeUser();
  if (!user) return challengeExpiredResponse();

  const limited = await checkTwoFactorRateLimit(user.id);
  if (limited) return limited;

  const parsed = await parseBody(request, twoFactorVerifySchema);
  if ("error" in parsed) return parsed.error;
  const { code, backupCode } = parsed.data;

  if (backupCode) {
    const result = await consumeBackupCode(user.id, backupCode);
    if (!result) {
      await logActivity(user.email, "security.two_factor_failed", "backup code");
      return NextResponse.json(
        { error: "That backup code isn't valid or has already been used." },
        { status: 401 }
      );
    }
    await logActivity(user.email, "security.backup_code_used", `${result.remaining} remaining`);
    await completeTwoFactorSignIn(user.id);
    return NextResponse.json({ ok: true, backupCodesRemaining: result.remaining });
  }

  const check = await verifyTotpCode(user.id, code ?? "");
  if (check !== "ok") {
    const reused = check === "reused";
    await logActivity(
      user.email,
      "security.two_factor_failed",
      reused ? "reused authenticator code" : "authenticator code"
    );
    return NextResponse.json(
      {
        error: reused
          ? "That code has already been used. Wait for your app to show a new one."
          : "Incorrect code. Enter the code your authenticator app is showing now.",
      },
      { status: 401 }
    );
  }

  await completeTwoFactorSignIn(user.id);
  return NextResponse.json({ ok: true });
});
