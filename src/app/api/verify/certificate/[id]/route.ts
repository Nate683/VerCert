import { withApiErrorHandling } from "@/lib/api-error";
import { publicRecordById } from "@/lib/coa/public";
import { readFile } from "@/lib/coa/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// VIEW VERICERT COA: the original laboratory PDF, byte-for-byte as uploaded (its SHA-256 is checked on every read).
// Public, no account — but only for a certificate that is approved and published; anything else is a plain 404, so
// staging and rejected records can't be probed. ?download=1 serves it as a download instead of inline.
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
      // Short, so unpublishing takes effect quickly.
      "Cache-Control": "public, max-age=60",
      ETag: `"${file.sha256}"`,
    },
  });
});
