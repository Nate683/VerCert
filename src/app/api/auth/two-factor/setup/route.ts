import { NextResponse } from "next/server";
import { challengeExpiredResponse, getTwoFactorChallengeUser } from "@/lib/two-factor/challenge";
import { beginTwoFactorEnrollment } from "@/lib/two-factor/store";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Generates the secret behind the enrollment QR code. Only reachable mid
// sign-in, and only for an account with no authenticator yet — someone
// holding just the password can't swap out an enrolled one.
export const POST = withApiErrorHandling(async () => {
  const user = await getTwoFactorChallengeUser();
  if (!user) return challengeExpiredResponse();

  const enrollment = await beginTwoFactorEnrollment(user);
  if (!enrollment) {
    return NextResponse.json(
      { error: "Two-factor authentication is already set up for this account." },
      { status: 409 }
    );
  }
  return NextResponse.json(enrollment);
});
