import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getContent, setContent, DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/site-content";
import { withApiErrorHandling } from "@/lib/api-error";
import { z } from "zod";
import { parseBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

const notificationSettingsSchema = z.object({
  emailAddress: z.string().trim().max(200),
  notifyNewOrder: z.boolean(),
  notifyLowStock: z.boolean(),
});

export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const settings = await getContent("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
  return NextResponse.json({ settings });
});

export const PATCH = withApiErrorHandling(async (request: Request) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, notificationSettingsSchema);
  if ("error" in parsed) return parsed.error;

  await setContent("notification_settings", parsed.data);
  return NextResponse.json({ ok: true });
});
