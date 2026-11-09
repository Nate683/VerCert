import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { adminOverview, uploadCertificate } from "@/lib/coa/admin";
import { MAX_PDF_BYTES } from "@/lib/coa/extract";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // extraction can take a while on long certificates

// Certificates (COA verification) — admin list and upload. Executive accounts only, checked on the server for every
// call; a direct call from any other account gets 401 whatever the UI shows.

export const GET = withApiErrorHandling(async () => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  return NextResponse.json({ ...(await adminOverview()), serverToday: new Date().toISOString().slice(0, 10) });
});

// Upload one certificate PDF. Creates a record that needs review, is pending and hidden — never approved or published.
export const POST = withApiErrorHandling(async (request: Request) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_PDF_BYTES + 64 * 1024) return NextResponse.json({ error: "The file is larger than 4 MB." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach a PDF file." }, { status: 400 });
  const actor = (await getCurrentCustomer())!;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const outcome = await uploadCertificate(bytes, file.name, form?.get("isTest") === "1", actor.email);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, recordId: outcome.recordId }, { status: outcome.status });
  return NextResponse.json({ record: outcome.record }, { status: 201 });
});
