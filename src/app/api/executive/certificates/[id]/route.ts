import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { act, adminRecord, editRecord, removeRecord, uploadCorrection, type Action } from "@/lib/coa/admin";
import { listAudit, listRevisions } from "@/lib/coa/store";
import { MAX_PDF_BYTES } from "@/lib/coa/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // a corrected PDF is extracted too

type Params = { params: Promise<{ id: string }> };
const ACTIONS: Action[] = [
  "mark_reviewed",
  "approve",
  "reject",
  "publish",
  "unpublish",
  "check_link",
  "confirm_link",
  "acknowledge_warnings",
  "publish_revision",
  "discard_revision",
  "restore",
  "acknowledge_alert",
];

// Executive accounts only, checked on the server for every call; a direct call from any other account gets 401.

export const GET = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;
  const record = await adminRecord(id);
  if (!record) return NextResponse.json({ error: "Record not found." }, { status: 404 });
  return NextResponse.json({ record, audit: await listAudit(id), revisions: await listRevisions(id) });
});

// Field edits ({ fields: {...} }) or a decision ({ action, reason?, url? }). `url` is the exact link the administrator
// opened, for confirm_link.
export const PATCH = withApiErrorHandling(async (request: Request, { params }: Params) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { fields?: Record<string, unknown>; action?: string; reason?: string; url?: string } | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const actor = (await getCurrentCustomer())!;
  if (body.action !== undefined) {
    if (!ACTIONS.includes(body.action as Action)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    const out = await act(id, body.action as Action, typeof body.reason === "string" ? body.reason : null, actor.email, {
      url: typeof body.url === "string" ? body.url : undefined,
    });
    return out.ok ? NextResponse.json({ record: out.record }) : NextResponse.json({ error: out.error, issues: out.issues }, { status: out.status });
  }
  if (!body.fields || typeof body.fields !== "object" || Array.isArray(body.fields)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const out = await editRecord(id, body.fields, actor.email);
  return out.ok
    ? NextResponse.json({ record: out.record, revision: out.revision ?? false, unpublished: out.unpublished ?? false })
    : NextResponse.json({ error: out.error }, { status: out.status });
});

// UPLOAD CORRECTED PDF for this report (multipart "file").
export const POST = withApiErrorHandling(async (request: Request, { params }: Params) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_PDF_BYTES + 64 * 1024) return NextResponse.json({ error: "The file is larger than 4 MB." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach a PDF file." }, { status: 400 });
  const actor = (await getCurrentCustomer())!;
  const out = await uploadCorrection(id, new Uint8Array(await file.arrayBuffer()), file.name, actor.email);
  return out.ok ? NextResponse.json({ record: out.record }) : NextResponse.json({ error: out.error, recordId: out.recordId }, { status: out.status });
});

// DELETE COA — recoverable (the record, PDF and history are kept; Restore brings it back, unpublished).
export const DELETE = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;
  const actor = (await getCurrentCustomer())!;
  const out = await removeRecord(id, actor.email);
  return out.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: out.error }, { status: out.status });
});
