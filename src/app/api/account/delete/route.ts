import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { verifyPassword } from "@/lib/users/password";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/users/session";
import { eraseCustomer } from "@/lib/users/erase";
import { getOrdersByCustomer } from "@/lib/orders/store";
import { getAffiliateByEmail } from "@/lib/affiliates";
import { requiresTwoFactor } from "@/lib/two-factor/store";
import { ATTRIBUTION_COOKIE } from "@/lib/marketing/attribution";
import { sendMail } from "@/lib/email";
import { logActivity } from "@/lib/activity-log";
import { accountDeleteSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Self-service account deletion — the deletion right under the Texas DPSA and
// CCPA. It can't be undone, so the password is asked for again.
export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await getCurrentCustomer();
  if (!user) {
    return NextResponse.json({ error: "Sign in to delete your account." }, { status: 401 });
  }

  const limit = await checkRateLimit(`account-delete:${user.id}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, accountDeleteSchema);
  if ("error" in parsed) return parsed.error;

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }
  if (requiresTwoFactor(user)) {
    return NextResponse.json({ error: "Executive accounts can't be deleted from here." }, { status: 403 });
  }
  // An affiliate's commission and payout history is a business record with
  // its own obligations, so closing one is handled by hand.
  if (await getAffiliateByEmail(user.email)) {
    return NextResponse.json(
      {
        error:
          "Your account is linked to the affiliate program, which keeps commission and payout records. Contact us and we'll close it for you.",
      },
      { status: 409 }
    );
  }
  const orders = await getOrdersByCustomer(user.id);
  if (orders.some((o) => o.status === "paid" || o.status === "processing")) {
    return NextResponse.json(
      { error: "You have an order being prepared. You can delete your account once it has shipped." },
      { status: 409 }
    );
  }

  const { ordersAnonymized } = await eraseCustomer(user);

  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
  cookieStore.delete(ATTRIBUTION_COOKIE);

  // No name or email in the log entry — keeping either would undo the deletion.
  await logActivity("self-service", "account.deleted", `${ordersAnonymized} order record(s) kept, anonymized`);

  try {
    await sendMail(
      user.email,
      "Your VeriCert account has been deleted",
      [
        "Your VeriCert account and the personal data attached to it have been deleted.",
        "",
        "We keep records of past orders (items, amounts and dates) for accounting and tax purposes. They're no longer linked to you, and your name, email and address have been removed from them.",
        "",
        "If you didn't ask for this, contact us through the Contact page on our website.",
        "",
        "— VeriCert Research",
      ].join("\n")
    );
  } catch (err) {
    console.error("Failed to send account deletion confirmation:", err);
  }

  return NextResponse.json({ ok: true });
});
