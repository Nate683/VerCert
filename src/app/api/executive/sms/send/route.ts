import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listUsers } from "@/lib/users/store";
import { listAffiliates } from "@/lib/affiliates";
import { sendSms } from "@/lib/sms";

export const dynamic = "force-dynamic";

type SendSmsBody = {
  recipients: "all-optin" | "all-affiliates" | string[]; // emails, when an array
  body: string;
};

// Only ever texts a customer/affiliate who explicitly opted in with a phone
// number — regardless of what the client requested.
export async function POST(request: Request) {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: SendSmsBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Message body is required." }, { status: 400 });
  }

  const users = await listUsers();
  const optedIn = users.filter((u) => u.smsOptIn && u.phone);

  let targets = optedIn;
  if (body.recipients === "all-affiliates") {
    const affiliateEmails = new Set((await listAffiliates()).filter((a) => a.active).map((a) => a.email));
    targets = optedIn.filter((u) => affiliateEmails.has(u.email));
  } else if (Array.isArray(body.recipients)) {
    targets = optedIn.filter((u) => body.recipients.includes(u.email));
  }

  let sent = 0;
  const failures: string[] = [];
  for (const user of targets) {
    try {
      await sendSms(user.phone!, body.body);
      sent++;
    } catch (err) {
      failures.push(`${user.email}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ sent, failures });
}
