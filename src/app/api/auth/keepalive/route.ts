import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/users/session";
import { setCustomerSessionCookie } from "@/lib/users/session-cookie";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { STAFF_SESSION_MAX_MS } from "@/lib/users/idle";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Called by IdleTimeout when someone is actually using a staff page. A
// two-factor session is re-issued for another idle window, but never past
// STAFF_SESSION_MAX_MS from sign-in; the new expiry and that hard limit are
// returned. Any other session is only confirmed (expiresAt: null), and the
// browser keeps the idle clock itself.
export const POST = withApiErrorHandling(async () => {
  const cookieStore = await cookies();
  const session = await verifyCustomerSessionToken(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
  const user = session ? await getCurrentCustomer() : null;
  if (!session || !user) {
    return NextResponse.json({ error: "Your session has ended." }, { status: 401 });
  }
  if (!session.twoFactorVerified) return NextResponse.json({ ok: true, expiresAt: null, limitAt: null });

  // A session from before the sign-in time was recorded is at most one idle
  // window old, so its limit counts from now.
  const signedInAt = session.signedInAt ?? Date.now();
  const limitAt = signedInAt + STAFF_SESSION_MAX_MS;
  if (Date.now() >= limitAt) {
    return NextResponse.json({ error: "Your session has ended.", limitReached: true }, { status: 401 });
  }
  const expiresAt = await setCustomerSessionCookie(user.id, { twoFactorVerified: true, signedInAt });
  return NextResponse.json({ ok: true, expiresAt, limitAt });
});
