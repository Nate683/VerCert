import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { setNotificationPreferences } from "@/lib/users/store";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Saves the optional notification emails from account settings. Order and
// shipping notifications are transactional and can't be turned off, so they
// aren't accepted here.
export const POST = withApiErrorHandling(async (request: Request) => {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { notifyStock?: unknown; notifyCoa?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const valid = (v: unknown) => v === undefined || typeof v === "boolean";
  if (!valid(body.notifyStock) || !valid(body.notifyCoa) || (body.notifyStock === undefined && body.notifyCoa === undefined)) {
    return NextResponse.json({ error: "notifyStock and notifyCoa must be true or false." }, { status: 400 });
  }

  const updated = await setNotificationPreferences(user.id, {
    notifyStock: body.notifyStock as boolean | undefined,
    notifyCoa: body.notifyCoa as boolean | undefined,
  });
  return NextResponse.json({ notifyStock: updated?.notifyStock ?? false, notifyCoa: updated?.notifyCoa ?? false });
});
