import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listUsers } from "@/lib/users/store";
import { listAffiliates } from "@/lib/affiliates";
import { sendMarketingEmail, createUnsubscribeToken } from "@/lib/resend";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

type SendEmailBody = {
  recipients: "all-optin" | "all-affiliates" | string[];
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

  const siteUrl = getSiteUrl();
  let sent = 0;
  const failures: string[] = [];

  if (body.recipients === "all-affiliates") {
    // Affiliates are business partners, not marketing subscribers — sent to
    // every active affiliate's business email with no unsubscribe footer.
    const affiliates = (await listAffiliates()).filter((a) => a.active);
    for (const affiliate of affiliates) {
      const result = await sendMarketingEmail({ to: affiliate.email, subject: body.subject, text: body.body });
      if (result.ok) sent++;
      else failures.push(`${affiliate.email}: ${result.error}`);
    }
    return NextResponse.json({ sent, skipped: 0, failures });
  }

  const users = await listUsers();
  const optedIn = users.filter((u) => u.marketingOptIn);

  // Only ever email opted-in customers, regardless of what the client requested.
  const targets =
    body.recipients === "all-optin"
      ? optedIn
      : optedIn.filter((u) => body.recipients.includes(u.email));

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

