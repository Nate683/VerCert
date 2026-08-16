import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { deleteCalendarEvent } from "@/lib/calendar/store";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await params;
  await deleteCalendarEvent(id);
  return NextResponse.json({ ok: true });
});
