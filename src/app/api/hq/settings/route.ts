import { NextResponse } from "next/server";
import { getHqMember, isLeaderboardEnabled, setLeaderboardEnabled } from "@/lib/hq";
import { hqSettingsSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  const member = await getHqMember();
  if (!member) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const leaderboardEnabled = await isLeaderboardEnabled();
  return NextResponse.json({ leaderboardEnabled });
});

// Executive-only — either realm can toggle the leaderboard for /hq.
export const PATCH = withApiErrorHandling(async (request: Request) => {
  const member = await getHqMember();
  if (!member || member.kind !== "executive") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const parsed = await parseBody(request, hqSettingsSchema);
  if ("error" in parsed) return parsed.error;

  await setLeaderboardEnabled(parsed.data.leaderboardEnabled);
  return NextResponse.json({ ok: true });
});
