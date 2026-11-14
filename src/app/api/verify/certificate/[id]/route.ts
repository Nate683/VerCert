import { withApiErrorHandling } from "@/lib/api-error";
import { publicRecordById } from "@/lib/coa/public";
import { readFile } from "@/lib/coa/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// VERIFY VERICERT COA: the original laboratory PDF, byte-for-byte as uploaded (its SHA-256 is checked on every read).
// Public, no account — but only for a certificate that is currently PUBLISHED, not deleted and not test data; anything
// else is a plain 404, so drafts, unpublished, deleted, synthetic and rejected records can't be probed. A corrected
// report replaces its record's file atomically, so this URL then serves only the corrected PDF: the superseded one has
// no public URL. ?download=1 serves it as a download instead of inline.
export const GET = withApiErrorHandling(async (request: Request, { params }: Params) => {
  const { id } = await params;
  const record = /^[0-9a-f-]{36}$/i.test(id) ? await publicRecordById(id) : null;
  if (!record?.fileId) return new Response("Not found", { status: 404 });
  const file = await readFile(record.fileId);
  if (!file) return new Response("Not found", { status: 404 });
  const safeLot = (record.lotNumber ?? "lot").replace(/[^A-Za-z0-9._-]/g, "_");
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.bytes.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="VeriCert-COA-${safeLot}.pdf"`,
      "X-Content-Type-Options": "nosniff",
      // Never cached by a CDN or kept by the browser (owner decision D5): unpublishing, deleting or replacing a
      // certificate takes effect on the very next request.
      "Cache-Control": "private, no-store",
      ETag: `"${file.sha256}"`,
    },
  });
});
