import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { listInviteCodes, createInviteCode, getTierInfo } from "@/lib/affiliates";
import { inviteCodeSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { sendInviteCodeEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Command-only — generating codes controls who can get instant affiliate
// access, so this is kept out of /office's shared Affiliates tab.
export const GET = withApiErrorHandling(async () => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const codes = await listInviteCodes();
  return NextResponse.json({ codes });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, inviteCodeSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const code = await createInviteCode(parsed.data);
    const actor = await getCurrentCustomer();
    if (actor) await logActivity(actor.email, "invite_code.created", code.code);

    // Bound to a specific person — email them the code + signup link
    // immediately instead of making the CEO copy/paste it by hand.
    if (code.boundEmail) {
      const tierInfo = getTierInfo(code.tier);
      sendInviteCodeEmail({
        email: code.boundEmail,
        code: code.code,
        tierLabel: tierInfo?.label ?? code.tier,
      }).catch((err) => console.error("Failed to send invite code email:", err));
    }

    return NextResponse.json({ code });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create invite code." },
      { status: 400 }
    );
  }
});
