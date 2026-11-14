"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AcceptanceCriteria, CertificateGroup, CoaLot, CoaRecord, CoaRevision, InventoryAlert, Laboratory, TestResult, TestStatus } from "@/lib/coa/types";
import { KNOWN_TESTS, TEST_STATUSES, TEST_STATUS_LABELS } from "@/lib/coa/types";
import type { Issue, ProductInfo } from "@/lib/coa/validate";
import type { CriterionCheck } from "@/lib/coa/criteria";
import { CertificateResultsDialog } from "@/components/verify/CertificateResults";

// Certificates tab (executive portal): the COA workflow.
//   Upload PDF → extraction → associate product, strength, lot; correct anything (SAVE CHANGES works on incomplete
//   drafts) → mark reviewed → OPEN LABORATORY LINK and CONFIRM it shows this report → acknowledge quality warnings →
//   approve → PREVIEW PUBLIC VIEW (optional) → PUBLISH.
// Nothing is approved or published automatically; quality findings are advisory (acknowledged, never a veto); the
// server re-checks every rule (lib/coa/admin.ts). Synthetic test records can be previewed but never published.

type RevisionView = CoaRevision & { issues: Issue[]; unacknowledged: Issue[]; canPublish: boolean };
type AdminRecord = CoaRecord & {
  issues: Issue[];
  checks: CriterionCheck[];
  unacknowledged: Issue[];
  linkConfirmed: boolean;
  canApprove: boolean;
  canPublish: boolean;
  isPublished: boolean;
  lot: CoaLot | null;
  pendingRevision: RevisionView | null;
  openAlert: InventoryAlert | null;
  file: { fileName: string; sizeBytes: number; pageCount: number | null; sha256: string } | null;
};
type AuditEntry = { id: string; action: string; actor: string; at: string; details: unknown };
type Overview = { records: AdminRecord[]; products: ProductInfo[]; labs: Laboratory[]; criteria: AcceptanceCriteria[]; alerts: InventoryAlert[]; serverToday: string };
type Conflict = { kind: "duplicate_pdf" | "same_report"; recordId: string; lotNumber: string | null; labReportId: string | null; productSlug: string | null; sizeLabel: string | null; published: boolean; deleted: boolean };

const LABEL = "text-[10px] uppercase tracking-[0.1em] text-white/40";
const BUTTON = "border border-white/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-[var(--x-muted)] hover:text-[var(--x-text)] disabled:opacity-30";
const PRIMARY = "border border-[var(--x-muted)] bg-[var(--x-raised)] px-4 py-2 text-xs uppercase tracking-[0.12em] text-[var(--x-text)] hover:border-[var(--x-text)] disabled:opacity-30";
const DANGER = "border border-[var(--x-negative)]/60 px-4 py-2 text-xs uppercase tracking-[0.12em] text-[var(--x-negative)] hover:bg-[var(--x-negative)]/10 disabled:opacity-30";

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}
const recordLabel = (r: Pick<CoaRecord, "compoundName" | "sizeLabel" | "lotNumber" | "labReportId">) =>
  `${r.compoundName ?? "Product not set"}${r.sizeLabel ? ` ${r.sizeLabel}` : ""} · lot ${r.lotNumber ?? "—"}${r.labReportId ? ` · report ${r.labReportId}` : ""}`;

// The automatic link check, worded honestly: a page the server can't read is not an invalid link.
function linkCheckWording(r: AdminRecord): string {
  if (!r.verificationUrl) return "No laboratory link.";
  if (r.verificationStatus === "valid") return "Automatic check: the page loads on the laboratory's site and identifies this report.";
  if (r.verificationStatus === "unchecked" || r.verificationStatus === "none") return "Not checked automatically (optional).";
  if (/doesn't show this certificate's report or lot number/.test(r.verificationNote ?? "")) return "Automatic check: the page couldn't be read automatically (it builds its content in the browser). That doesn't make the link invalid — open it and confirm by eye.";
  return `Automatic check: ${(r.verificationNote ?? "it didn't pass").replace(/\.\s*$/, "")}. Open the link to see what it shows.`;
}

function StatusLine({ r }: { r: AdminRecord }) {
  const errors = r.issues.filter((i) => i.level === "error").length;
  const chip = "border px-1.5 py-0.5";
  return (
    <div className="space-y-1 text-[11px]">
      <div className="flex flex-wrap gap-1">
        {r.deletedAt && <span className={`${chip} border-[var(--x-negative)]/60 text-[var(--x-negative)]`}>DELETED</span>}
        {r.isTest && <span className={`${chip} border-[var(--x-warning)]/60 text-[var(--x-warning)]`}>TEST DATA</span>}
        <span className={`${chip} ${r.approvalStatus === "approved" ? "border-[var(--x-positive)]/50 text-[var(--x-positive)]" : r.approvalStatus === "rejected" ? "border-[var(--x-negative)]/50 text-[var(--x-negative)]" : "border-white/20 text-white/60"}`}>{r.approvalStatus}</span>
        <span className={`${chip} ${r.isPublished ? "border-[var(--x-gold)] text-[var(--x-gold)]" : "border-white/15 text-white/40"}`}>{r.isPublished ? "PUBLISHED" : "not public"}</span>
        {r.linkConfirmed && <span className={`${chip} border-white/20 text-white/60`}>link confirmed</span>}
        {r.pendingRevision && <span className={`${chip} border-[var(--x-warning)]/60 text-[var(--x-warning)]`}>revision pending</span>}
        {r.openAlert && <span className={`${chip} border-[var(--x-negative)]/60 text-[var(--x-negative)]`}>QUALITY ALERT</span>}
      </div>
      <p className="text-white/50">
        {r.reviewStatus === "reviewed" ? "Reviewed" : "Needs review"}
        {!r.isPublished && !r.deletedAt && ` · ${errors ? `${errors} requirement${errors === 1 ? "" : "s"} open` : r.unacknowledged.length ? `${r.unacknowledged.length} warning${r.unacknowledged.length === 1 ? "" : "s"} to acknowledge` : r.approvalStatus === "pending" ? "ready to approve" : "ready to publish"}`}
      </p>
    </div>
  );
}

// DELETE COA confirmation, naming exactly what will be deleted.
function DeleteConfirm({ r, onCancel, onConfirm, busy }: { r: AdminRecord; onCancel: () => void; onConfirm: () => void; busy: boolean }) {
  return (
    <div role="alertdialog" aria-labelledby={`del-${r.id}`} className="mt-3 border border-[var(--x-negative)]/50 bg-[var(--x-negative)]/5 p-4 text-xs text-white/80">
      <p id={`del-${r.id}`} className="font-semibold uppercase tracking-[0.12em] text-[var(--x-negative)]">Delete this certificate?</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
        <dt className="text-white/50">Product</dt><dd>{r.compoundName ?? "—"}</dd>
        <dt className="text-white/50">Strength</dt><dd>{r.sizeLabel ?? "—"}</dd>
        <dt className="text-white/50">VeriCert lot</dt><dd className="font-mono">{r.lotNumber ?? "—"}</dd>
        <dt className="text-white/50">Laboratory report</dt><dd className="font-mono">{r.labReportId ?? "—"}</dd>
      </dl>
      <p className="mt-2 text-white/60">
        {r.isPublished ? "It is published: it leaves the public search, lot page and PDF link immediately. " : ""}
        Other reports in this lot are not affected. The record, its PDF and its history are kept and can be restored.
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={onConfirm} className={DANGER}>Delete COA</button>
        <button type="button" disabled={busy} onClick={onCancel} className={BUTTON}>Cancel</button>
      </div>
    </div>
  );
}

export function CertificatesPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [isTest, setIsTest] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [conflict, setConflict] = useState<{ file: File; conflict: Conflict; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pendingSelect, setPendingSelect] = useState<string | null>(null);
  const editorDirty = useRef(false);
  const onEditorDirty = useCallback((d: boolean) => { editorDirty.current = d; }, []);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/executive/certificates", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Couldn't load certificates."); return; }
    setData(json);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-time fetch
    load();
  }, [load]);

  // Switching to another record never silently drops unsaved edits.
  function trySelect(id: string | null) {
    if (editorDirty.current && id !== selected) { setPendingSelect(id ?? "__close__"); return; }
    editorDirty.current = false;
    setSelected(id);
  }

  async function sendUpload(file: File, opts: { asNew?: boolean } = {}) {
    const body = new FormData();
    body.set("file", file);
    if (isTest) body.set("isTest", "1");
    if (opts.asNew) body.set("asNew", "1");
    const res = await fetch("/api/executive/certificates", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (json.conflict) setConflict({ file, conflict: json.conflict, message: json.error });
      else setError(`${file.name}: ${json.error ?? "upload failed."}`);
      return;
    }
    setNotice(`Uploaded ${file.name}. Check the extracted fields against the PDF; it is saved as a draft and nothing is public.`);
    trySelect(json.record.id);
  }

  async function upload(files: FileList | File[]) {
    setError(null); setNotice(null); setConflict(null);
    for (const file of Array.from(files)) {
      setUploading(file.name);
      await sendUpload(file);
    }
    setUploading(null);
    await load();
  }

  async function uploadAsCorrection(file: File, recordId: string) {
    setUploading(file.name); setError(null);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch(`/api/executive/certificates/${recordId}`, { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setUploading(null);
    setConflict(null);
    if (!res.ok) { setError(json.error ?? "Couldn't upload the correction."); return; }
    setNotice(json.record.pendingRevision ? "Correction saved as a pending revision. The published version stays public until you publish the revision." : "Corrected PDF attached to the draft. Review it again.");
    trySelect(recordId);
    await load();
  }

  async function quickAction(r: AdminRecord, action: string, reason?: string) {
    setError(null); setNotice(null);
    const res = await fetch(`/api/executive/certificates/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(`${json.error ?? "That didn't work."}${json.issues ? ` ${json.issues.map((i: Issue) => i.message).join(" ")}` : ""}`); return false; }
    setNotice(`${action.replace(/_/g, " ")}: ${recordLabel(r)} — done.`);
    await load();
    return true;
  }

  async function remove(r: AdminRecord) {
    const res = await fetch(`/api/executive/certificates/${r.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setConfirmDelete(null);
    if (!res.ok) { setError(json.error ?? "Couldn't delete."); return; }
    setNotice(`Deleted ${recordLabel(r)}. It can be restored from "Show deleted".`);
    await load();
  }

  const visible = data?.records.filter((r) => showDeleted || !r.deletedAt) ?? [];
  const openAlerts = data?.alerts.filter((a) => !a.acknowledgedAt) ?? [];

  return (
    <div className="space-y-6">
      {openAlerts.length > 0 && (
        <div role="alert" className="command-panel border border-[var(--x-negative)]/60 p-5" data-quality-alerts>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--x-negative)]">Quality alert — review inventory / remove from sale</p>
          <ul className="mt-2 space-y-1 text-xs text-white/80">
            {openAlerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-2">
                <span>
                  {data?.products.find((p) => p.slug === a.productSlug)?.name ?? a.productSlug ?? "—"} {a.sizeLabel ?? ""} · lot <span className="font-mono">{a.lotNumber ?? "—"}</span> —{" "}
                  {Array.isArray((a.details as { failed?: string[] })?.failed) ? (a.details as { failed: string[] }).failed.join(" ") : a.reason}
                </span>
                <button type="button" onClick={() => trySelect(a.recordId)} className={BUTTON}>Open record</button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-white/50">Stays until you acknowledge it in the record. Nothing in inventory, availability or checkout was changed automatically.</p>
        </div>
      )}

      <div className="command-panel p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Certificates of Analysis</p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/70">
          Upload a laboratory COA as a PDF. Extraction fills what it can; check and correct every field against the PDF —
          drafts save at any point. Then open the laboratory link and confirm it shows this report, acknowledge any quality
          warnings, approve, and publish. Only certificates you publish appear in the public search and on the lot&apos;s page.
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
          className={`mt-5 flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-8 text-center transition-colors ${dragging ? "border-[var(--x-text)] bg-[var(--x-raised)]" : "border-white/20"}`}
        >
          <p className="text-sm text-white/70">{uploading ? `Uploading and reading ${uploading}…` : "Drop certificate PDFs here"}</p>
          <button type="button" disabled={Boolean(uploading)} onClick={() => fileInput.current?.click()} className={BUTTON}>Choose PDF files</button>
          <input ref={fileInput} type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} aria-label="Certificate PDF files" />
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} className="h-4 w-4 accent-[var(--x-warning)]" aria-label="Synthetic test record" />
            Synthetic test record — flagged as test data, can be previewed, never published
          </label>
          <p className="text-[11px] text-white/40">PDF only, up to 4 MB. The file is stored exactly as uploaded.</p>
        </div>

        {conflict && (
          <div role="alertdialog" aria-label="Upload conflict" className="mt-4 border border-[var(--x-warning)]/50 bg-[var(--x-warning)]/5 p-4 text-xs text-white/80" data-upload-conflict>
            <p className="font-semibold text-[var(--x-warning)]">{conflict.file.name}: {conflict.message}</p>
            <p className="mt-1 text-white/60">
              Existing record: {data?.products.find((p) => p.slug === conflict.conflict.productSlug)?.name ?? conflict.conflict.productSlug ?? "—"} {conflict.conflict.sizeLabel ?? ""} · lot {conflict.conflict.lotNumber ?? "—"} · report {conflict.conflict.labReportId ?? "—"} · {conflict.conflict.deleted ? "deleted" : conflict.conflict.published ? "published" : "not published"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => { if (conflict.conflict.deleted) setShowDeleted(true); trySelect(conflict.conflict.recordId); setConflict(null); }} className={BUTTON}>Open existing record</button>
              {conflict.conflict.kind === "same_report" && (
                <>
                  <button type="button" onClick={() => uploadAsCorrection(conflict.file, conflict.conflict.recordId)} className={BUTTON}>Upload as corrected report (replaces it once published)</button>
                  <button type="button" onClick={async () => { const f = conflict.file; setConflict(null); setUploading(f.name); await sendUpload(f, { asNew: true }); setUploading(null); await load(); }} className={BUTTON}>Keep as a separate record</button>
                </>
              )}
              <button type="button" onClick={() => setConflict(null)} className={BUTTON}>Cancel</button>
            </div>
          </div>
        )}

        {pendingSelect && (
          <div role="alertdialog" aria-label="Unsaved changes" className="mt-4 border border-[var(--x-warning)]/50 p-3 text-xs text-white/80">
            You have unsaved changes in the open certificate.
            <span className="ml-3 inline-flex gap-2">
              <button type="button" onClick={() => { editorDirty.current = false; setSelected(pendingSelect === "__close__" ? null : pendingSelect); setPendingSelect(null); }} className={BUTTON}>Discard and continue</button>
              <button type="button" onClick={() => setPendingSelect(null)} className={BUTTON}>Keep editing</button>
            </span>
          </div>
        )}
        {notice && <p role="status" className="mt-4 border border-[var(--x-positive)]/40 p-3 text-xs text-[var(--x-positive)]">{notice}</p>}
        {error && <p role="alert" className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}

        <div className="mt-4 flex items-center gap-2 text-xs text-white/60">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} className="h-4 w-4" aria-label="Show deleted certificates" />
            Show deleted
          </label>
        </div>

        <div className="mt-3 overflow-x-auto">
          {!data ? (
            <p className="text-sm text-white/30">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-white/30">No certificates yet.</p>
          ) : (
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/15 text-xs uppercase tracking-[0.1em] text-white/40">
                  <th className="pb-3 pr-4 font-normal">Title</th>
                  <th className="pb-3 pr-4 font-normal">Preview</th>
                  <th className="pb-3 pr-4 font-normal">Status</th>
                  <th className="pb-3 pr-4 font-normal">Dates</th>
                  <th className="pb-3 pr-4 font-normal">Last modified</th>
                  <th className="pb-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} data-certificate={r.id} className={`border-b border-white/5 align-top ${r.deletedAt ? "opacity-60" : ""}`}>
                    <td className="py-3 pr-4">
                      <p className="text-white">{r.compoundName ?? "Product not set"}{r.sizeLabel ? ` · ${r.sizeLabel}` : ""}</p>
                      <p className="font-mono text-xs text-white/60">Lot {r.lotNumber ?? "—"}</p>
                      {r.lot && <p className="text-[10px] text-white/35">Lot first uploaded {when(r.lot.firstUploadedAt)}{r.lot.needsReview ? " · needs review" : ""}</p>}
                    </td>
                    <td className="py-3 pr-4 text-xs text-white/60">
                      <p>{r.laboratoryName ?? "Laboratory not set"} · report {r.labReportId ?? "—"}</p>
                      <p>Purity {r.purityResult ?? "—"} · Quantity {r.quantityResult ?? "—"}</p>
                      {r.fileId && <a href={`/api/executive/certificates/${r.id}/pdf`} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-white">Open PDF</a>}
                    </td>
                    <td className="py-3 pr-4"><StatusLine r={r} /></td>
                    <td className="py-3 pr-4 text-xs text-white/60">
                      <p>Tested {r.testedOn ?? "—"}</p>
                      <p>Issued {r.issuedOn ?? "—"}</p>
                      {r.publishedAt && <p>Published {when(r.publishedAt)}</p>}
                    </td>
                    <td className="py-3 pr-4 text-xs text-white/60">
                      {when(r.updatedAt)}
                      <span className="block text-[10px] text-white/35">{r.updatedBy}</span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => trySelect(r.id)} className={BUTTON}>{r.deletedAt ? "View" : "Edit"}</button>
                        {r.deletedAt ? (
                          <button type="button" onClick={() => quickAction(r, "restore")} className={BUTTON}>Restore</button>
                        ) : (
                          <>
                            <button type="button" disabled={!r.canApprove} onClick={() => quickAction(r, "approve")} className={BUTTON} title={r.canApprove ? "" : "Open the editor to see what's left"}>Approve</button>
                            {r.isPublished
                              ? <button type="button" onClick={() => quickAction(r, "unpublish")} className={BUTTON}>Unpublish</button>
                              : <button type="button" disabled={!r.canPublish} onClick={() => quickAction(r, "publish")} className={BUTTON} title={r.canPublish ? "" : "Open the editor to see what's left"}>Publish</button>}
                            <button type="button" onClick={() => setConfirmDelete(r.id)} className={BUTTON}>Delete</button>
                          </>
                        )}
                      </div>
                      {confirmDelete === r.id && <DeleteConfirm r={r} busy={false} onCancel={() => setConfirmDelete(null)} onConfirm={() => remove(r)} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && data && (
        <RecordEditor
          key={selected}
          id={selected}
          overview={data}
          onDirty={onEditorDirty}
          onClose={() => trySelect(null)}
          onChanged={async (msg) => { if (msg) setNotice(msg); await load(); }}
        />
      )}

      {data && <Settings overview={data} onChanged={load} />}
    </div>
  );
}

// --- Editor ------------------------------------------------------------------------------------------------------------

type Form = {
  lotNumber: string; productSlug: string; sizeLabel: string; laboratoryId: string; labReportId: string; testedOn: string; issuedOn: string;
  purityResult: string; purityPercent: string; quantityResult: string; quantityMg: string; appearance: string; verificationUrl: string;
  inventoryStatus: string; historical: boolean; dispositionOn: string; testResults: TestResult[];
};
const toForm = (r: CoaRecord): Form => ({
  lotNumber: r.lotNumber ?? "", productSlug: r.productSlug ?? "", sizeLabel: r.sizeLabel ?? "", laboratoryId: r.laboratoryId ?? "", labReportId: r.labReportId ?? "",
  testedOn: r.testedOn ?? "", issuedOn: r.issuedOn ?? "", purityResult: r.purityResult ?? "", purityPercent: r.purityPercent?.toString() ?? "",
  quantityResult: r.quantityResult ?? "", quantityMg: r.quantityMg?.toString() ?? "", appearance: r.appearance ?? "", verificationUrl: r.verificationUrl ?? "",
  inventoryStatus: r.inventoryStatus, historical: r.historical, dispositionOn: r.dispositionOn ?? "", testResults: r.testResults,
});

function IssueList({ issues, acknowledged }: { issues: Issue[]; acknowledged: { code: string; message: string }[] }) {
  const errors = issues.filter((i) => i.level === "error");
  const advisories = issues.filter((i) => i.level === "advisory");
  const notes = issues.filter((i) => i.level === "warning");
  const acked = (i: Issue) => acknowledged.some((a) => a.code === i.code && a.message === i.message);
  return (
    <div className="space-y-3 text-xs" data-issues>
      <div>
        <p className="text-[10px] uppercase tracking-[0.1em] text-red-300">Required before approval and publication</p>
        {errors.length === 0 ? <p className="mt-1 text-[var(--x-positive)]">All met.</p> : (
          <ul className="mt-1 space-y-1">{errors.map((i, n) => <li key={n} data-level="error" className="text-red-300">{i.message}</li>)}</ul>
        )}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--x-warning)]">Quality warnings — advisory; acknowledge to proceed</p>
        {advisories.length === 0 ? <p className="mt-1 text-white/50">None.</p> : (
          <ul className="mt-1 space-y-1">
            {advisories.map((i, n) => (
              <li key={n} data-level="advisory" className={acked(i) ? "text-white/50" : "text-[var(--x-warning)]"}>
                {acked(i) ? "Acknowledged — " : ""}{i.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      {notes.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">Notes</p>
          <ul className="mt-1 space-y-1">{notes.map((i, n) => <li key={n} data-level="warning" className="text-white/60">{i.message}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function RecordEditor({ id, overview, onClose, onChanged, onDirty }: { id: string; overview: Overview; onClose: () => void; onChanged: (msg?: string) => Promise<void>; onDirty: (dirty: boolean) => void }) {
  const [record, setRecord] = useState<AdminRecord | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [ackNote, setAckNote] = useState("");
  const [alertNote, setAlertNote] = useState("");
  const [openedUrl, setOpenedUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<CertificateGroup[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const correctionInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/executive/certificates/${id}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(json.error ?? "Couldn't load the record."); return; }
    setRecord(json.record);
    setForm(toForm(json.record));
    setAuditLog(json.audit);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  // Unsaved-change protection: the panel won't switch records, and the browser warns before leaving the page.
  const dirty = Boolean(record && form && JSON.stringify(form) !== JSON.stringify(toForm(record)));
  useEffect(() => {
    onDirty(dirty);
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);

  if (!record || !form) return <div className="command-panel p-6"><p className="text-sm text-white/40">{err ?? "Loading…"}</p></div>;
  const product = overview.products.find((p) => p.slug === form.productSlug);
  const locked = record.approvalStatus === "rejected" || Boolean(record.deletedAt);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function send(body: object, success: string | ((json: { revision?: boolean; unpublished?: boolean }) => string)) {
    setBusy(true); setErr(null); setMsg(null);
    const res = await fetch(`/api/executive/certificates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(`${json.error ?? "That didn't work."}${json.issues ? " " + json.issues.map((i: Issue) => i.message).join(" ") : ""}`); return false; }
    setMsg(typeof success === "function" ? success(json) : success);
    await load();
    await onChanged();
    return true;
  }

  function save() {
    const f = form!;
    send({
      fields: {
        lotNumber: f.lotNumber || null, productSlug: f.productSlug || null, sizeLabel: f.sizeLabel || null, laboratoryId: f.laboratoryId || null,
        labReportId: f.labReportId || null, testedOn: f.testedOn || null, issuedOn: f.issuedOn || null, purityResult: f.purityResult || null,
        quantityResult: f.quantityResult || null, appearance: f.appearance || null, verificationUrl: f.verificationUrl || null,
        inventoryStatus: f.inventoryStatus, historical: f.historical, dispositionOn: f.dispositionOn || null, testResults: f.testResults,
        ...(f.purityPercent !== (record!.purityPercent?.toString() ?? "") ? { purityPercent: f.purityPercent === "" ? null : f.purityPercent } : {}),
        ...(f.quantityMg !== (record!.quantityMg?.toString() ?? "") ? { quantityMg: f.quantityMg === "" ? null : f.quantityMg } : {}),
      },
    }, (json) =>
      json.unpublished
        ? "Saved. Because the product, strength, lot, report or laboratory link changed, it was taken off the public site — review, confirm the link and publish again."
        : json.revision
          ? "Saved as a pending revision. The published version stays public until you publish the revision."
          : "Saved (draft). Nothing was published.");
  }

  async function uploadCorrection(file: File) {
    setBusy(true); setErr(null); setMsg(null);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch(`/api/executive/certificates/${id}`, { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(json.error ?? "Couldn't upload the corrected PDF."); return; }
    setMsg(json.record.pendingRevision ? "Corrected PDF saved as a pending revision. The published version stays public until you publish it." : "Corrected PDF attached to this draft. Review it again.");
    await load();
    await onChanged();
  }

  async function openPreview() {
    setErr(null);
    const res = await fetch(`/api/executive/certificates/${id}/preview`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(json.error ?? "Couldn't build the preview."); return; }
    if (!json.groups.length) { setErr("Enter the lot number, product and strength to preview the public view."); return; }
    setPreview(json.groups);
  }

  const input = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input value={String(form[k] ?? "")} disabled={locked} onChange={(e) => set(k, e.target.value as never)} className="input-field mt-1" aria-label={label} {...props} />
    </label>
  );
  const found = record.extraction?.found ?? {};
  const source = (key: string) => found[key] ? <span className="mt-1 block text-[10px] text-white/35">PDF: &ldquo;{found[key].source}&rdquo;</span> : null;
  const savedUrl = record.verificationUrl;
  const urlUnsaved = form.verificationUrl !== (savedUrl ?? "");
  const rev = record.pendingRevision;

  return (
    <div className="command-panel p-6" data-editor={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">
          Certificate — {record.compoundName ?? "product not set"} {record.sizeLabel ?? ""} · lot {record.lotNumber ?? "—"} {record.isTest && <span className="text-[var(--x-warning)]">· TEST DATA</span>}
          {record.isPublished && <span className="text-[var(--x-gold)]"> · PUBLISHED</span>}
          {record.deletedAt && <span className="text-[var(--x-negative)]"> · DELETED</span>}
        </p>
        <div className="flex gap-2">
          {record.fileId && <a href={`/api/executive/certificates/${id}/pdf`} target="_blank" rel="noopener" className={BUTTON}>Open PDF</a>}
          <button type="button" onClick={onClose} className={BUTTON}>Close</button>
        </div>
      </div>
      {record.file && <p className="mt-1 text-[11px] text-white/40">{record.file.fileName} · {(record.file.sizeBytes / 1024).toFixed(0)} KB · {record.file.pageCount ?? "?"} page(s) · SHA-256 {record.file.sha256.slice(0, 16)}…</p>}
      {record.lot && <p className="mt-1 text-[11px] text-white/40">Lot chronology: first uploaded {when(record.lot.firstUploadedAt)} ({record.lot.chronologySource === "backfill" ? "from existing records" : "upload"}){record.lot.needsReview ? ` · needs review: ${record.lot.reviewNote}` : ""}</p>}
      {record.approvalStatus === "rejected" && <p className="mt-3 text-xs text-[var(--x-negative)]">Rejected: {record.rejectionReason}. This record is closed.</p>}
      {record.deletedAt && <p className="mt-3 text-xs text-[var(--x-negative)]">Deleted {when(record.deletedAt)} by {record.deletedBy}. Restore it from the list to edit or publish it again.</p>}

      {msg && <p role="status" className="mt-4 border border-[var(--x-positive)]/40 p-3 text-xs text-[var(--x-positive)]">{msg}</p>}
      {err && <p role="alert" className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{err}</p>}
      {dirty && <p className="mt-3 text-[11px] text-[var(--x-warning)]">Unsaved changes.</p>}

      {record.openAlert && (
        <div className="mt-4 border border-[var(--x-negative)]/60 p-4 text-xs" data-record-alert>
          <p className="font-semibold uppercase tracking-[0.14em] text-[var(--x-negative)]">Quality alert — review inventory / remove from sale</p>
          <p className="mt-1 text-white/70">{Array.isArray((record.openAlert.details as { failed?: string[] })?.failed) ? (record.openAlert.details as { failed: string[] }).failed.join(" ") : record.openAlert.reason}</p>
          <p className="mt-1 text-white/50">Raised {when(record.openAlert.createdAt)}. Inventory, availability and checkout were not changed — do that in Inventory if needed.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input value={alertNote} onChange={(e) => setAlertNote(e.target.value)} placeholder="What was done (e.g. removed from sale)" className="input-field max-w-md" aria-label="Inventory alert acknowledgment" />
            <button type="button" disabled={busy || alertNote.trim().length < 3} onClick={() => send({ action: "acknowledge_alert", reason: alertNote }, "Inventory alert acknowledged.")} className={BUTTON}>Acknowledge alert</button>
          </div>
        </div>
      )}

      {rev && (
        <div className="mt-4 border border-[var(--x-warning)]/50 p-4 text-xs" data-pending-revision>
          <p className="font-semibold uppercase tracking-[0.14em] text-[var(--x-warning)]">Pending {rev.kind === "correction" ? "corrected report" : "revision"} — not public yet</p>
          <p className="mt-1 text-white/60">The published version stays public until you publish this. Saved {when(rev.createdAt)} by {rev.createdBy}.</p>
          <ul className="mt-2 space-y-0.5 text-white/70">
            {Object.entries(rev.patch).filter(([k]) => !["extraction", "reviewStatus", "manualFields"].includes(k)).map(([k, v]) => (
              <li key={k}>{k}: <span className="text-white/40">{JSON.stringify((record as Record<string, unknown>)[k] ?? null)}</span> → {JSON.stringify(v)}</li>
            ))}
            {rev.fileId && <li>New PDF: <a href={`/api/executive/certificates/${id}/pdf?revision=1`} target="_blank" rel="noopener" className="underline underline-offset-2">open corrected PDF</a> (replaces the published PDF on publication)</li>}
          </ul>
          <div className="mt-3"><IssueList issues={rev.issues} acknowledged={record.warningsAcknowledged} /></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy || !rev.canPublish} onClick={() => send({ action: "publish_revision" }, rev.kind === "correction" ? "Corrected report published. The previous version and its PDF are no longer public." : "Revision published.")} className={PRIMARY}>Publish revision</button>
            <button type="button" disabled={busy} onClick={() => send({ action: "discard_revision" }, "Revision discarded.")} className={BUTTON}>Discard revision</button>
          </div>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className={LABEL}>VeriCert lot number</span>
          <input value={form.lotNumber} disabled={locked} onChange={(e) => set("lotNumber", e.target.value)} className="input-field mt-1 font-mono" aria-label="VeriCert lot number" />
          {source("lotNumber")}
        </label>
        <label className="block">
          <span className={LABEL}>Product</span>
          <select value={form.productSlug} disabled={locked} onChange={(e) => { set("productSlug", e.target.value); set("sizeLabel", ""); }} className="input-field mt-1" aria-label="Product">
            <option value="">— choose —</option>
            {overview.products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
          {source("compoundName")}
        </label>
        <label className="block">
          <span className={LABEL}>Strength (size)</span>
          <select value={form.sizeLabel} disabled={locked || !product} onChange={(e) => set("sizeLabel", e.target.value)} className="input-field mt-1" aria-label="Strength">
            <option value="">— choose —</option>
            {product?.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {source("strength")}
          {product && <span className="mt-1 block text-[10px] text-white/35">Catalog lots: {product.batchNumbers.join(", ") || "none"}</span>}
        </label>
        <label className="block">
          <span className={LABEL}>Laboratory</span>
          <select value={form.laboratoryId} disabled={locked} onChange={(e) => set("laboratoryId", e.target.value)} className="input-field mt-1" aria-label="Laboratory">
            <option value="">— choose —</option>
            {overview.labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {source("laboratoryName")}
        </label>
        <div>{input("labReportId", "Laboratory report number")}{source("labReportId")}</div>
        <div>{input("appearance", "Appearance")}{source("appearance")}</div>
        <div>{input("testedOn", "Date tested", { type: "date", max: overview.serverToday })}{source("testedOn")}</div>
        <div>{input("issuedOn", "Date issued", { type: "date", max: overview.serverToday })}{source("issuedOn")}</div>
        <div />
        <div>{input("purityResult", "Purity result (as printed)")}{source("purityResult")}</div>
        <div>{input("purityPercent", "Purity figure (%) — only if the printed result isn't a single number", { inputMode: "decimal" })}</div>
        <div />
        <div>{input("quantityResult", "Active peptide quantity (as printed)")}{source("quantityResult")}</div>
        <div>{input("quantityMg", "Quantity figure (mg) — only if the printed result isn't a single number", { inputMode: "decimal" })}</div>
        <div />
        <div className="sm:col-span-2" data-lab-link>
          {input("verificationUrl", "Laboratory verification link (exact certificate record)", { type: "url", placeholder: "https://…" })}
          {source("verificationUrl")}
          <p className="mt-1 text-[11px] text-white/50">{linkCheckWording(record)}{record.verificationCheckedAt ? ` (checked ${when(record.verificationCheckedAt)})` : ""}</p>
          <p className={`mt-1 text-[11px] ${record.linkConfirmed ? "text-[var(--x-positive)]" : "text-[var(--x-warning)]"}`} data-link-confirmation>
            {record.linkConfirmed
              ? `Confirmed by ${record.linkConfirmedBy} on ${when(record.linkConfirmedAt)} — shows report ${record.linkConfirmedReportId}.`
              : record.linkConfirmedAt
                ? "The link or report number changed since it was confirmed — open it and confirm again."
                : "Not confirmed yet: open the link, check it shows this report, then confirm."}
          </p>
          {urlUnsaved && <p className="mt-1 text-[11px] text-[var(--x-warning)]">Save the new link before opening and confirming it.</p>}
        </div>
        <div className="flex flex-col items-start justify-end gap-2">
          <a
            href={savedUrl && !urlUnsaved ? savedUrl : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!savedUrl || urlUnsaved}
            onClick={(e) => { if (!savedUrl || urlUnsaved) { e.preventDefault(); return; } setOpenedUrl(savedUrl); }}
            className={`${BUTTON} ${!savedUrl || urlUnsaved ? "pointer-events-none opacity-30" : ""}`}
            data-open-lab-link
          >
            Open laboratory link
          </a>
          <button
            type="button"
            disabled={busy || locked || !savedUrl || urlUnsaved || openedUrl !== savedUrl || record.linkConfirmed}
            title={openedUrl !== savedUrl ? "Open the link first" : ""}
            onClick={() => send({ action: "confirm_link", url: openedUrl }, "Laboratory link confirmed for this report.")}
            className={BUTTON}
            data-confirm-lab-link
          >
            Confirm laboratory link
          </button>
          <button type="button" disabled={busy || !savedUrl} onClick={() => send({ action: "check_link" }, "Automatic check done (information only).")} className={BUTTON}>Automatic check</button>
        </div>
        <label className="block">
          <span className={LABEL}>Inventory availability</span>
          <select value={form.inventoryStatus} disabled={Boolean(record.deletedAt)} onChange={(e) => set("inventoryStatus", e.target.value)} className="input-field mt-1" aria-label="Inventory availability">
            <option value="auto">Automatic (from catalog and stock)</option>
            <option value="available">Available</option>
            <option value="unavailable">Not currently available</option>
          </select>
        </label>
        <label className="input-field flex items-center gap-3 self-end">
          <input type="checkbox" checked={form.historical} disabled={Boolean(record.deletedAt)} onChange={(e) => set("historical", e.target.checked)} className="h-4 w-4" aria-label="Historical lot" />
          <span className="text-sm text-white/70">Historical lot (sold out / disposed)</span>
        </label>
        <div>{input("dispositionOn", "Final disposition date", { type: "date" })}</div>
      </div>

      {/* Additional tests */}
      <div className="mt-6">
        <p className={LABEL}>Additional tests (as reported on the certificate)</p>
        <div className="mt-2 space-y-2">
          {form.testResults.map((t, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_160px_auto]">
              <input value={t.name} disabled={locked} onChange={(e) => set("testResults", form.testResults.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="input-field" aria-label={`Test ${i + 1} name`} />
              <input value={t.method ?? ""} disabled={locked} placeholder="Method" onChange={(e) => set("testResults", form.testResults.map((x, j) => (j === i ? { ...x, method: e.target.value || null } : x)))} className="input-field" aria-label={`Test ${i + 1} method`} />
              <input value={t.result ?? ""} disabled={locked} placeholder="Result as printed" onChange={(e) => set("testResults", form.testResults.map((x, j) => (j === i ? { ...x, result: e.target.value || null } : x)))} className="input-field" aria-label={`Test ${i + 1} result`} />
              <select value={t.status} disabled={locked} onChange={(e) => set("testResults", form.testResults.map((x, j) => (j === i ? { ...x, status: e.target.value as TestStatus } : x)))} className="input-field" aria-label={`Test ${i + 1} status`}>
                {TEST_STATUSES.map((s) => <option key={s} value={s}>{TEST_STATUS_LABELS[s]}</option>)}
              </select>
              <button type="button" disabled={locked} onClick={() => set("testResults", form.testResults.filter((_, j) => j !== i))} className={BUTTON}>Remove</button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {KNOWN_TESTS.filter((k) => !form.testResults.some((t) => t.key === k.key)).map((k) => (
            <button key={k.key} type="button" disabled={locked} onClick={() => set("testResults", [...form.testResults, { key: k.key, name: k.name, method: null, result: null, status: "requires_review" }])} className={BUTTON}>+ {k.name}</button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={busy || locked} onClick={save} className={PRIMARY}>{busy ? "Working…" : "Save changes"}</button>
        <button type="button" disabled={busy || locked || record.approvalStatus !== "pending" || record.reviewStatus === "reviewed" || dirty} onClick={() => send({ action: "mark_reviewed" }, "Marked reviewed.")} className={PRIMARY}>Mark reviewed</button>
        <button type="button" disabled={busy || !record.canApprove || dirty} onClick={() => send({ action: "approve" }, "Approved. Publish it to make it public.")} className={PRIMARY}>Approve</button>
        {record.isPublished ? (
          <button type="button" disabled={busy} onClick={() => send({ action: "unpublish" }, "Unpublished — removed from the public search, lot page and PDF link.")} className={PRIMARY}>Unpublish</button>
        ) : (
          <button type="button" disabled={busy || !record.canPublish || dirty} onClick={() => send({ action: "publish" }, "Published.")} className={PRIMARY} title={record.isTest ? "Test records are never published" : ""}>Publish</button>
        )}
        <button type="button" disabled={busy || Boolean(record.deletedAt)} onClick={openPreview} className={PRIMARY}>Preview public view</button>
        <button type="button" disabled={busy || locked || !record.fileId} onClick={() => correctionInput.current?.click()} className={PRIMARY}>Upload corrected PDF</button>
        <input ref={correctionInput} type="file" accept="application/pdf" className="hidden" aria-label="Corrected certificate PDF" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCorrection(f); e.target.value = ""; }} />
        {!record.deletedAt && <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} className={DANGER}>Delete COA</button>}
      </div>
      {confirmDelete && (
        <DeleteConfirm
          r={record}
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setBusy(true);
            const res = await fetch(`/api/executive/certificates/${id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            setBusy(false); setConfirmDelete(false);
            if (!res.ok) { setErr(json.error ?? "Couldn't delete."); return; }
            setMsg("Deleted. It can be restored from the list (Show deleted).");
            await load(); await onChanged();
          }}
        />
      )}
      {!locked && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection" className="input-field max-w-md" aria-label="Rejection reason" />
          <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => send({ action: "reject", reason }, "Rejected.")} className={BUTTON}>Reject</button>
        </div>
      )}

      {/* Validation */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className={LABEL}>Checks against acceptance criteria (advisory)</p>
          {record.checks.length === 0 ? <p className="mt-2 text-xs text-white/50">No criteria apply to this product, or no product is set.</p> : (
            <ul className="mt-2 space-y-1 text-xs">
              {record.checks.map((c) => (
                <li key={c.key} className={c.status === "passed" ? "text-[var(--x-positive)]" : c.status === "failed" ? "text-[var(--x-negative)]" : "text-[var(--x-warning)]"}>
                  {TEST_STATUS_LABELS[c.status]} — {c.label}: {c.detail}
                </li>
              ))}
            </ul>
          )}
          <p className={`${LABEL} mt-5`}>Findings</p>
          <div className="mt-2"><IssueList issues={record.issues} acknowledged={record.warningsAcknowledged} /></div>
          {[...record.unacknowledged, ...(rev?.unacknowledged ?? [])].length > 0 && !locked && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input value={ackNote} onChange={(e) => setAckNote(e.target.value)} placeholder="Note (optional)" className="input-field max-w-xs" aria-label="Acknowledgment note" />
              <button type="button" disabled={busy || dirty} onClick={() => send({ action: "acknowledge_warnings", reason: ackNote }, "Quality warnings acknowledged.")} className={BUTTON} data-acknowledge-warnings>Acknowledge warnings</button>
            </div>
          )}
          {record.warningsAcknowledgedAt && <p className="mt-2 text-[11px] text-white/40">Last acknowledged by {record.warningsAcknowledgedBy} on {when(record.warningsAcknowledgedAt)}.</p>}
        </div>
        <div>
          <p className={LABEL}>Extraction ({record.extraction?.method ?? "none"}{record.extraction?.model ? `, ${record.extraction.model}` : ""})</p>
          {record.extraction ? (
            <div className="mt-2 space-y-2 text-xs text-white/60">
              <p>Found in the PDF: {Object.keys(record.extraction.found).join(", ") || "nothing"}.</p>
              {record.extraction.missing.length > 0 && <p>Not in the PDF (left empty): {record.extraction.missing.join(", ")}.</p>}
              {record.extraction.rejected.map((r, n) => <p key={n} className="text-[var(--x-warning)]">Discarded {r.field} &ldquo;{r.value}&rdquo;: {r.reason}.</p>)}
              {record.extraction.notes.map((note, n) => <p key={n}>{note}</p>)}
              {record.manualFields.length > 0 && <p className="text-white/45">Set by hand (extraction never overwrites): {record.manualFields.join(", ")}.</p>}
            </div>
          ) : <p className="mt-2 text-xs text-white/50">No extraction.</p>}
          <p className={`${LABEL} mt-5`}>Audit trail</p>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-[11px] text-white/50" data-audit>
            {auditLog.map((a) => <li key={a.id}>{when(a.at)} · {a.actor} · {a.action}</li>)}
          </ul>
        </div>
      </div>

      {preview && <CertificateResultsDialog title="Preview public view — not public" groups={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// --- Laboratories and criteria -------------------------------------------------------------------------------------------

function Settings({ overview, onChanged }: { overview: Overview; onChanged: () => Promise<void> }) {
  const [lab, setLab] = useState({ id: "", name: "", hosts: "", note: "" });
  const [crit, setCrit] = useState({ productSlug: "*", applies: true, minPurity: "99.0", qMin: "100", qMax: "120", tests: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function post(body: object, ok: string) {
    setMsg(null); setErr(null);
    const res = await fetch("/api/executive/certificates/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(json.error ?? "Couldn't save."); return; }
    setMsg(ok);
    await onChanged();
  }
  async function del(query: string, ok: string) {
    setMsg(null); setErr(null);
    if (!window.confirm("Remove it?")) return;
    const res = await fetch(`/api/executive/certificates/settings?${query}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(json.error ?? "Couldn't remove."); return; }
    setMsg(ok);
    await onChanged();
  }
  function loadCriteria(slug: string) {
    const c = overview.criteria.find((x) => x.productSlug === slug);
    setCrit(c
      ? { productSlug: slug, applies: c.applies, minPurity: c.minPurityPercent?.toString() ?? "", qMin: c.quantityMinPercent?.toString() ?? "", qMax: c.quantityMaxPercent?.toString() ?? "", tests: c.requiredTests.join(", ") }
      : { productSlug: slug, applies: true, minPurity: "99.0", qMin: "100", qMax: "120", tests: "" });
  }

  return (
    <div className="command-panel p-6">
      <p className="text-xs uppercase tracking-[0.2em] text-white/40">Laboratories &amp; acceptance criteria</p>
      {msg && <p role="status" className="mt-3 text-xs text-[var(--x-positive)]">{msg}</p>}
      {err && <p role="alert" className="mt-3 text-xs text-red-300">{err}</p>}
      <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <p className={LABEL}>Laboratories</p>
          <ul className="mt-2 space-y-2 text-sm">
            {overview.labs.length === 0 && <li className="text-xs text-white/40">None yet.</li>}
            {overview.labs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 pb-2">
                <span className="text-white">{l.name}<span className="block text-[11px] text-white/45">Verification hosts: {l.verificationHosts.join(", ") || "none"}{l.accreditationNote ? ` · ${l.accreditationNote}` : ""}</span></span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setLab({ id: l.id, name: l.name, hosts: l.verificationHosts.join(", "), note: l.accreditationNote ?? "" })} className={BUTTON}>Edit</button>
                  <button type="button" onClick={() => del(`lab=${l.id}`, "Laboratory removed.")} className={BUTTON}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <input value={lab.name} onChange={(e) => setLab({ ...lab, name: e.target.value })} placeholder="Laboratory name" className="input-field" aria-label="Laboratory name" />
            <input value={lab.hosts} onChange={(e) => setLab({ ...lab, hosts: e.target.value })} placeholder="Verification hosts, comma separated (e.g. verify.examplelab.com)" className="input-field" aria-label="Verification hosts" />
            <input value={lab.note} onChange={(e) => setLab({ ...lab, note: e.target.value })} placeholder="Accreditation and its scope, as the laboratory states it (optional)" className="input-field" aria-label="Accreditation note" />
            <div className="flex gap-2">
              <button type="button" onClick={() => post({ kind: "lab", id: lab.id || undefined, name: lab.name, verificationHosts: lab.hosts.split(","), accreditationNote: lab.note }, "Laboratory saved.").then(() => setLab({ id: "", name: "", hosts: "", note: "" }))} className={BUTTON}>{lab.id ? "Save laboratory" : "Add laboratory"}</button>
              {lab.id && <button type="button" onClick={() => setLab({ id: "", name: "", hosts: "", note: "" })} className={BUTTON}>Cancel</button>}
            </div>
          </div>
        </div>
        <div>
          <p className={LABEL}>Acceptance criteria</p>
          <ul className="mt-2 space-y-1 text-xs text-white/60">
            {overview.criteria.map((c) => (
              <li key={c.productSlug}>
                <button type="button" onClick={() => loadCriteria(c.productSlug)} className="underline underline-offset-2 hover:text-white">
                  {c.productSlug === "*" ? "Default" : overview.products.find((p) => p.slug === c.productSlug)?.name ?? c.productSlug}
                </button>
                {": "}
                {c.applies ? `purity ≥ ${c.minPurityPercent ?? "—"}%, quantity ${c.quantityMinPercent ?? "—"}–${c.quantityMaxPercent ?? "—"}% of label${c.requiredTests.length ? `, requires ${c.requiredTests.join(", ")}` : ""}` : "not applicable"}
              </li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select value={crit.productSlug} onChange={(e) => loadCriteria(e.target.value)} className="input-field col-span-2" aria-label="Criteria product">
              <option value="*">Default (all products without their own)</option>
              {overview.products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
            <label className="input-field col-span-2 flex items-center gap-3">
              <input type="checkbox" checked={crit.applies} onChange={(e) => setCrit({ ...crit, applies: e.target.checked })} className="h-4 w-4" aria-label="Criteria apply" />
              <span className="text-sm text-white/70">Peptide criteria apply to this product</span>
            </label>
            <input value={crit.minPurity} onChange={(e) => setCrit({ ...crit, minPurity: e.target.value })} placeholder="Min purity %" className="input-field" aria-label="Minimum purity" />
            <span />
            <input value={crit.qMin} onChange={(e) => setCrit({ ...crit, qMin: e.target.value })} placeholder="Quantity min % of label" className="input-field" aria-label="Quantity minimum" />
            <input value={crit.qMax} onChange={(e) => setCrit({ ...crit, qMax: e.target.value })} placeholder="Quantity max % of label" className="input-field" aria-label="Quantity maximum" />
            <input value={crit.tests} onChange={(e) => setCrit({ ...crit, tests: e.target.value })} placeholder={`Required tests: ${KNOWN_TESTS.map((k) => k.key).join(", ")}`} className="input-field col-span-2" aria-label="Required tests" />
            <div className="col-span-2 flex gap-2">
              <button type="button" onClick={() => post({ kind: "criteria", productSlug: crit.productSlug, applies: crit.applies, minPurityPercent: crit.minPurity, quantityMinPercent: crit.qMin, quantityMaxPercent: crit.qMax, requiredTests: crit.tests.split(",") }, "Criteria saved.")} className={BUTTON}>Save criteria</button>
              {crit.productSlug !== "*" && overview.criteria.some((c) => c.productSlug === crit.productSlug) && (
                <button type="button" onClick={() => del(`criteria=${encodeURIComponent(crit.productSlug)}`, "Product criteria removed (the default applies).")} className={BUTTON}>Use default</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
