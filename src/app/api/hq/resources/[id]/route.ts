import { NextResponse } from "next/server";
import { getHqMember, deleteResource } from "@/lib/hq";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const member = await getHqMember();
  if (!member || member.kind !== "executive") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { id } = await params;
  await deleteResource(id);
  return NextResponse.json({ ok: true });
});
