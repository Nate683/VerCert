import { NextResponse } from "next/server";
import { getHqMember, listHqMembers } from "@/lib/hq";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Full roster for starting a new DM — excludes the requester themselves.
export const GET = withApiErrorHandling(async () => {
  const member = await getHqMember();
  if (!member) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const members = (await listHqMembers()).filter((m) => m.id !== member.id);
  return NextResponse.json({ members });
});
