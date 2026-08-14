import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listUsers } from "@/lib/users/store";
import { sendMarketingEmail, createUnsubscribeToken } from "@/lib/resend";

export const dynamic = "force-dynamic";

type SendEmailBody = {
  recipients: "all-optin" | string[];
  subject: string;
  body: string;
};

export async function POST(request: Request) {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: SendEmailBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: "Subject and body are required." }, { status: 400 });
  }

  const users = await listUsers();
  const optedIn = users.filter((u) => u.marketingOptIn);

  // Only ever email opted-in customers, regardless of what the client requested.
  const targets =
    body.recipients === "all-optin"
      ? optedIn
      : optedIn.filter((u) => body.recipients.includes(u.email));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  let sent = 0;
  const failures: string[] = [];

  for (const user of targets) {
    const token = await createUnsubscribeToken(user.email);
    const unsubscribeUrl = `${siteUrl}/unsubscribe?email=${encodeURIComponent(user.email)}&token=${token}`;
    const text = `${body.body}\n\n---\nUnsubscribe from these emails: ${unsubscribeUrl}`;

    const result = await sendMarketingEmail({ to: user.email, subject: body.subject, text });
    if (result.ok) sent++;
    else failures.push(`${user.email}: ${result.error}`);
  }

  return NextResponse.json({
    sent,
    skipped: (body.recipients === "all-optin" ? 0 : body.recipients.length) - targets.length,
    failures,
  });
}
