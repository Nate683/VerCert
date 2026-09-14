import { NextResponse } from "next/server";
import {
  challengeExpiredResponse,
  checkTwoFactorRateLimit,
  completeTwoFactorSignIn,
  getTwoFactorChallengeUser,
} from "@/lib/two-factor/challenge";
import { enableTwoFactor } from "@/lib/two-factor/store";
import { twoFactorCodeSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

// Confirms enrollment: a valid code proves the authenticator app really holds
// the pending secret before that secret is required at every sign-in.
export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await getTwoFactorChallengeUser();
  if (!user) return challengeExpiredResponse();

  const limited = await checkTwoFactorRateLimit(user.id);
  if (limited) return limited;

  const parsed = await parseBody(request, twoFactorCodeSchema);
  if ("error" in parsed) return parsed.error;

  const result = await enableTwoFactor(user.id, parsed.data.code);
  if (!result) {
    return NextResponse.json(
      {
        error:
          "That code didn't match. Check that your phone's clock is set automatically, then enter the code showing now.",
      },
      { status: 400 }
    );
  }

  await logActivity(user.email, "security.two_factor_enabled");
  await completeTwoFactorSignIn(user.id);
  return NextResponse.json({ ok: true, backupCodes: result.backupCodes });
});
