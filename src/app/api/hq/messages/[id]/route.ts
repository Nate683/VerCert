import { NextResponse } from "next/server";
import { getHqMember, getMessageById, deleteMessage } from "@/lib/hq";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Any /hq member can delete their own message; executives can delete any
// message (moderation).
export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const member = await getHqMember();
  if (!member) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const { id } = await params;
  const message = await getMessageById(id);
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  if (message.senderId !== member.id && member.kind !== "executive") {
    return NextResponse.json({ error: "You can't delete this message." }, { status: 403 });
  }

  await deleteMessage(id);
  return NextResponse.json({ ok: true });
});
