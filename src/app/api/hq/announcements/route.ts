import { NextResponse } from "next/server";
import { getHqMember, listAnnouncements, createAnnouncement } from "@/lib/hq";
import { hqAnnouncementSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  const member = await getHqMember();
  if (!member) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const announcements = await listAnnouncements();
  return NextResponse.json({ announcements });
});

// Executive-only — either realm can post/pin for /hq.
export const POST = withApiErrorHandling(async (request: Request) => {
  const member = await getHqMember();
  if (!member || member.kind !== "executive") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const parsed = await parseBody(request, hqAnnouncementSchema);
  if ("error" in parsed) return parsed.error;

  const announcement = await createAnnouncement({ authorName: member.name, ...parsed.data });
  return NextResponse.json({ announcement });
});
