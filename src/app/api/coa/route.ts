import { NextResponse } from "next/server";
import { lookupCoa } from "@/lib/coa";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const batch = searchParams.get("batch")?.trim();
  if (!batch) {
    return NextResponse.json({ error: "A batch number is required." }, { status: 400 });
  }

  const result = await lookupCoa(batch);
  return NextResponse.json({ result });
});
