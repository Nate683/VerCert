import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { act, adminRecord, editRecord, removeRecord, type Action } from "@/lib/coa/admin";
import { listAudit } from "@/lib/coa/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };
const ACTIONS: Action[] = ["mark_reviewed", "approve", "reject", "publish", "unpublish", "check_link"];

export const GET = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;
  const record = await adminRecord(id);
  if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });
  return NextResponse.json({ record, audit: await listAudit(id) });
});

// Field edits ({ fields: {...} }) or a decision ({ action, reason? }).
export const PATCH = withApiErrorHandling(async (request: Request, { params }: Params) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { fields?: Record<string, unknown>; action?: string; reason?: string } | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const actor = (await getCurrentCustomer())!;
  if (body.action !== undefined) {
    if (!ACTIONS.includes(body.action as Action)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const out = await act(id, body.action as Action, typeof body.reason === "string" ? body.reason : null, actor.email);
    return out.ok ? NextResponse.json({ record: out.record }) : NextResponse.json({ error: out.error, issues: out.issues }, { status: out.status });
  }
  if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const out = await editRecord(id, body.fields, actor.email);
  return out.ok ? NextResponse.json({ record: out.record }) : NextResponse.json({ error: out.error }, { status: out.status });
});

export const DELETE = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;
  const actor = (await getCurrentCustomer())!;
  const out = await removeRecord(id, actor.email);
  return out.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: out.error }, { status: out.status });
});
