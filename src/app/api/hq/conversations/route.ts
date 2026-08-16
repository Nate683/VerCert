import { NextResponse } from "next/server";
import { getHqMember, listDmChannelsFor, listHqMembers, parseDmChannel } from "@/lib/hq";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// One entry per existing DM thread the current member is part of, with the
// other participant's display name resolved for the conversation list.
export const GET = withApiErrorHandling(async () => {
  const member = await getHqMember();
  if (!member) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const [channels, members] = await Promise.all([listDmChannelsFor(member.id), listHqMembers()]);
  const membersById = new Map(members.map((m) => [m.id, m]));

  const conversations = channels
    .map((channel) => {
      const participants = parseDmChannel(channel);
      if (!participants) return null;
      const otherId = participants.find((p) => p !== member.id) ?? participants[0];
      const other = membersById.get(otherId);
      return { channel, otherId, otherName: other?.name ?? "Former member" };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return NextResponse.json({ conversations });
});
