import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";
import {
  deleteAnnouncement,
  findConflictingAnnouncement,
  getAnnouncement,
  toEditorFields,
  updateAnnouncement,
  validateAnnouncement,
} from "@/lib/announcements";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Edit or enable/disable. The body may carry any subset of the editor's fields (the list's Enable/Disable button
// sends just { enabled }); it is merged onto the stored record and the whole record is validated again, including
// the date order and the no-overlap rule.
export const PATCH = withApiErrorHandling(async (request: Request, { params }: Params) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await params;
  const existing = await getAnnouncement(id);
  if (!existing) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });

  const patch = await request.json().catch(() => null);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const result = validateAnnouncement({ ...toEditorFields(existing), ...patch });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  // Dates the request didn't touch keep their stored value exactly (the editor works to the minute).
  if (!("startsAt" in patch)) result.value.startsAt = existing.startsAt;
  if (!("endsAt" in patch)) result.value.endsAt = existing.endsAt;

  const conflict = await findConflictingAnnouncement(result.value, id, new Date().toISOString());
  if (conflict) {
    return NextResponse.json(
      { error: `This overlaps "${conflict.title}", which is already live or scheduled for the same audience in that period. Only one announcement per audience can show at a time: change the dates, disable one, or save this as a draft.` },
      { status: 409 }
    );
  }

  const actor = (await getCurrentCustomer())!;
  const announcement = await updateAnnouncement(id, result.value, actor.email);
  const what = "enabled" in patch && Object.keys(patch).length === 1 ? (result.value.enabled ? "enabled" : "disabled") : "updated";
  await logActivity(actor.email, `announcement.${what}`, result.value.title);
  return NextResponse.json({ announcement });
});

export const DELETE = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { id } = await params;
  const existing = await getAnnouncement(id);
  if (!existing || !(await deleteAnnouncement(id))) {
    return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  }
  const actor = (await getCurrentCustomer())!;
  await logActivity(actor.email, "announcement.deleted", existing.title);
  return NextResponse.json({ ok: true });
});
