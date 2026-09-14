import { NextResponse } from "next/server";
import {
  recordResendEvent,
  verifyResendSignature,
  type ResendWebhookEvent,
} from "@/lib/marketing/email-events";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Resend email events (opens, clicks, bounces, spam complaints). Configure in
// Resend → Webhooks with this URL; the signing secret goes in
// RESEND_WEBHOOK_SECRET.
export const POST = withApiErrorHandling(async (request: Request) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Email event webhook isn't configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyResendSignature(rawBody, request.headers, secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Verified above, so svix-id is present.
  await recordResendEvent(request.headers.get("svix-id") as string, event);
  return NextResponse.json({ ok: true });
});
