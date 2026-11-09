import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";
import {
  ADMIN_TIME_ZONE,
  createAnnouncement,
  findConflictingAnnouncement,
  listAnnouncements,
  validateAnnouncement,
} from "@/lib/announcements";

export const dynamic = "force-dynamic";

// Announcement banners (logged-in and logged-out). /command only: every handler checks the session's role on the server, so a
// direct call from any other account (customer, /office, signed out) is refused, whatever the UI shows.

export const GET = withApiErrorHandling(async () => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const announcements = await listAnnouncements();
  return NextResponse.json({ announcements, serverNow: new Date().toISOString(), timeZone: ADMIN_TIME_ZONE });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const result = validateAnnouncement(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const conflict = await findConflictingAnnouncement(result.value, null, new Date().toISOString());
  if (conflict) {
    return NextResponse.json(
      { error: `This overlaps "${conflict.title}", which is already live or scheduled for the same audience in that period. Only one announcement per audience can show at a time: change the dates, disable one, or save this as a draft.` },
      { status: 409 }
    );
  }

  const actor = (await getCurrentCustomer())!;
  const announcement = await createAnnouncement(result.value, actor.email);
  await logActivity(actor.email, "announcement.created", announcement.title);
  return NextResponse.json({ announcement }, { status: 201 });
});
