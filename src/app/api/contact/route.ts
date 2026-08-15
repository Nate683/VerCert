import { NextResponse } from "next/server";
import { getContent, DEFAULT_CONTACT } from "@/lib/site-content";
import { sendContactFormEmail } from "@/lib/email";
import { contactFormSchema, parseBody } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = withApiErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`contact:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const parsed = await parseBody(request, contactFormSchema);
  if ("error" in parsed) return parsed.error;
  const { name, email, subject, message } = parsed.data;

  const content = await getContent("contact_page", DEFAULT_CONTACT);
  if (!EMAIL_RE.test(content.email)) {
    return NextResponse.json(
      { error: "This form isn't accepting messages yet — the business hasn't set a contact email." },
      { status: 503 }
    );
  }

  await sendContactFormEmail({
    to: content.email,
    name,
    fromEmail: email,
    subject: subject ?? "",
    message,
  });

  return NextResponse.json({ ok: true });
});
