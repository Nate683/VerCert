import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { getSubscriberById, unsubscribeFromNewsletter } from "@/lib/newsletter";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { logActivity } from "@/lib/activity-log";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Removes a subscriber at their request. The row is kept, marked
// unsubscribed (source: staff_request), as the record that it was honoured.
export const POST = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await params;
  if (!(await getSubscriberById(id))) {
    return NextResponse.json({ error: "Subscriber not found." }, { status: 404 });
  }
  const subscriber = await unsubscribeFromNewsletter({ id }, "staff_request");
  const actor = await getCurrentCustomer();
  // The address isn't logged, so the log doesn't keep a copy of it.
  if (actor) await logActivity(actor.email, "newsletter.unsubscribed_by_staff", id);
  return NextResponse.json({ subscriber });
});
