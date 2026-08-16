import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listCalendarEvents, createCalendarEvent } from "@/lib/calendar/store";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const events = await listCalendarEvents();
  return NextResponse.json({ events });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const body = await request.json();
  if (!body.title?.trim() || !body.type || !body.date) {
    return NextResponse.json({ error: "title, type, and date are required." }, { status: 400 });
  }
  const event = await createCalendarEvent({
    title: body.title,
    type: body.type,
    date: body.date,
    notes: body.notes || undefined,
  });

  const actor = await getCurrentCustomer();
  if (actor) await logActivity(actor.email, "calendar.event_created", event.title);

  return NextResponse.json({ event });
});
