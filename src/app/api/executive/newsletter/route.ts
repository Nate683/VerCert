import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { listSubscribers } from "@/lib/newsletter";
import { toCsv } from "@/lib/csv";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const CSV_COLUMNS = ["email", "status", "signedUp", "sourcePage", "consentIp", "consentText", "unsubscribedAt", "unsubscribeSource"];

// The newsletter list, newest first — /command only, like Segments, since it's
// a contact list. ?format=csv downloads every row, unsubscribed included, as
// the consent and opt-out record.
export const GET = withApiErrorHandling(async (request: Request) => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const subscribers = await listSubscribers();

  if (new URL(request.url).searchParams.get("format") === "csv") {
    const csv = toCsv(
      subscribers.map((s) => ({
        email: s.email,
        status: s.status,
        signedUp: s.consentAt,
        sourcePage: s.sourcePath ?? "",
        consentIp: s.consentIp ?? "",
        consentText: s.consentText,
        unsubscribedAt: s.unsubscribedAt ?? "",
        unsubscribeSource: s.unsubscribeSource ?? "",
      })),
      CSV_COLUMNS
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="vericert-newsletter-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ subscribers });
});
