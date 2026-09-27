import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listUsers } from "@/lib/users/store";
import { listAffiliates } from "@/lib/affiliates";
import { sendAffiliateAnnouncement, sendMarketingEmail } from "@/lib/marketing/marketing-email";

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

  let sent = 0;
  const failures: string[] = [];

  if (body.recipients === "all-affiliates") {
    // Affiliates are business partners, not marketing subscribers — sent to
    // every active affiliate's business email with no unsubscribe footer.
    const affiliates = (await listAffiliates()).filter((a) => a.active);
    for (const affiliate of affiliates) {
      const result = await sendAffiliateAnnouncement({ to: affiliate.email, subject: body.subject, text: body.body });
      if (result.ok) sent++;
      else failures.push(`${affiliate.email}: ${result.error}`);
    }
    return NextResponse.json({ sent, skipped: 0, failures });
  }

  // Narrowed to consented customers here for the count; sendMarketingEmail
  // checks consent again itself, so a stale list can't slip anyone through.
  const users = await listUsers();
  const consented = users.filter((u) => u.marketingConsent);
  const targets =
    body.recipients === "all-optin"
      ? consented
      : consented.filter((u) => body.recipients.includes(u.email));

  let skipped = (body.recipients === "all-optin" ? 0 : body.recipients.length) - targets.length;
  for (const user of targets) {
    const result = await sendMarketingEmail(user.id, { subject: body.subject, text: body.body });
    if (result.status === "sent") sent++;
    else if (result.status === "skipped") skipped++;
    else failures.push(`${user.email}: ${result.error}`);
  }

  return NextResponse.json({ sent, skipped, failures });
}
