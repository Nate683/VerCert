import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/users/session";
import { setCustomerSessionCookie } from "@/lib/users/session-cookie";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Called by IdleTimeout when someone is actually using a staff page. A
// two-factor session is re-issued for another idle window and the new expiry
// returned; any other session is only confirmed (expiresAt: null), and the
// browser keeps the idle clock itself.
export const POST = withApiErrorHandling(async () => {
  const cookieStore = await cookies();
  const session = await verifyCustomerSessionToken(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
  const user = session ? await getCurrentCustomer() : null;
  if (!session || !user) {
    return NextResponse.json({ error: "Your session has ended." }, { status: 401 });
  }
  if (!session.twoFactorVerified) return NextResponse.json({ ok: true, expiresAt: null });

  const expiresAt = await setCustomerSessionCookie(user.id, { twoFactorVerified: true });
  return NextResponse.json({ ok: true, expiresAt });
});
