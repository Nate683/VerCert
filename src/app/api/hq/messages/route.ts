import { NextResponse } from "next/server";
import { getHqMember, listMessages, postMessage, parseDmChannel, dmChannelId } from "@/lib/hq";
import { hqMessageSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// DM channels are only readable/postable by their two participants — even
// executives can't read someone else's DM thread. "general" is open to any
// /hq member.
function canAccessChannel(channel: string, memberId: string): boolean {
  if (channel === "general") return true;
  const participants = parseDmChannel(channel);
  return Boolean(participants && participants.includes(memberId));
}

export const GET = withApiErrorHandling(async (request: Request) => {
  const member = await getHqMember();
  if (!member) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const withMemberId = searchParams.get("withMemberId");
  const channel = withMemberId ? dmChannelId(member.id, withMemberId) : searchParams.get("channel") ?? "general";
  if (!canAccessChannel(channel, member.id)) {
    return NextResponse.json({ error: "Not authorized for this conversation." }, { status: 403 });
  }

  const messages = await listMessages(channel);
  return NextResponse.json({ messages, channel });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  const member = await getHqMember();
  if (!member) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const parsed = await parseBody(request, hqMessageSchema);
  if ("error" in parsed) return parsed.error;
  const { body, toMemberId } = parsed.data;
  const channel = toMemberId ? dmChannelId(member.id, toMemberId) : parsed.data.channel ?? "general";

  if (!canAccessChannel(channel, member.id)) {
    return NextResponse.json({ error: "Not authorized for this conversation." }, { status: 403 });
  }

  const message = await postMessage({
    channel,
    senderId: member.id,
    senderName: member.name,
    senderKind: member.kind,
    body,
  });
  return NextResponse.json({ message });
});

