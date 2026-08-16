import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listTemplates, createTemplate, deleteTemplate } from "@/lib/templates/store";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const templates = await listTemplates();
  return NextResponse.json({ templates });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const body = await request.json();
  if (!body.name?.trim() || !body.body?.trim() || (body.channel !== "email" && body.channel !== "sms")) {
    return NextResponse.json({ error: "Name, channel, and body are required." }, { status: 400 });
  }
  const template = await createTemplate({
    name: body.name,
    channel: body.channel,
    subject: body.subject || undefined,
    body: body.body,
  });
  return NextResponse.json({ template });
});
