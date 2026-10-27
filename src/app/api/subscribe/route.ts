import { NextResponse } from "next/server";
import { getRealmForEmail } from "@/lib/executive/staff";
import { subscribeToNewsletter } from "@/lib/newsletter";
import { newsletterSignupSchema } from "@/lib/validation";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// A path on this site, without its query string, or nothing.
function sourcePath(raw: string | undefined): string | undefined {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw.split(/[?#]/)[0].slice(0, 200);
}

// The footer newsletter signup. Saves the address to the newsletter list with
// its consent record (wording, time, IP) and the page it came from. Only
// answers OK once the row is saved; an address already on the list gets the
// same OK, so the form never reveals who has signed up.
export const POST = withApiErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  const limit = await checkRateLimit(`newsletter:${ip}`, { limit: 5, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  // Validated here rather than with parseBody, so the message can be shown
  // under the field as it is.
  const parsed = newsletterSignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Enter a valid email address." }, { status: 400 });
  }
  const { email, source } = parsed.data;
  // The two executive addresses never go on a marketing list.
  if (getRealmForEmail(email)) return NextResponse.json({ ok: true });

  await subscribeToNewsletter({ email, sourcePath: sourcePath(source), ip });
  return NextResponse.json({ ok: true });
});
