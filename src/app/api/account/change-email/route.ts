import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { getUserByEmail, updateUser } from "@/lib/users/store";
import { generateToken } from "@/lib/users/password";
import { getRealmForEmail } from "@/lib/executive/staff";
import { sendMail } from "@/lib/email";
import { getSiteUrl } from "@/lib/site-url";
import { changeEmailSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";
const CHANGE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = await parseBody(request, changeEmailSchema);
  if ("error" in parsed) return parsed.error;
  const { newEmail } = parsed.data;

  if (newEmail === user.email) {
    return NextResponse.json({ error: "That's already your email address." }, { status: 400 });
  }
  // The reserved-staff-email check only protects against a non-executive
  // customer claiming a designated executive address — an executive
  // reclaiming their own designated address (e.g. reverting a change) must
  // still be allowed.
  if (!user.role && getRealmForEmail(newEmail)) {
    return NextResponse.json(
      { error: "This email address is reserved." },
      { status: 409 }
    );
  }
  if (await getUserByEmail(newEmail)) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const pendingEmailToken = generateToken();
  const pendingEmailTokenExpiresAt = new Date(Date.now() + CHANGE_TTL_MS).toISOString();
  await updateUser(user.id, { pendingEmail: newEmail, pendingEmailToken, pendingEmailTokenExpiresAt });

  const siteUrl = getSiteUrl();
  const confirmUrl = `${siteUrl}/api/account/change-email/confirm?token=${pendingEmailToken}`;
  try {
    await sendMail(
      newEmail,
      "Confirm your new VeriCert email address",
      `Please confirm this is your new email address by visiting:\n${confirmUrl}\n\nThis link expires in 24 hours. If you didn't request this change, you can ignore this email.`
    );
  } catch (err) {
    console.error("Failed to send email-change confirmation:", err);
  }

  return NextResponse.json({ ok: true });
});
