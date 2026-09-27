import { NextResponse } from "next/server";
import { unsubscribeFromLink } from "@/lib/marketing/unsubscribe";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// RFC 8058 one-click unsubscribe: mail clients POST to the List-Unsubscribe
// URL on every marketing email when the reader presses their Unsubscribe
// button. Signed out by design — the signature in the URL is the proof.
export const POST = withApiErrorHandling(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const email = await unsubscribeFromLink({ u: params.get("u"), t: params.get("t") });
  if (!email) return NextResponse.json({ error: "Invalid unsubscribe link." }, { status: 400 });
  return NextResponse.json({ ok: true });
});
