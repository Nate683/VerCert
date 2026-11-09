"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AcceptanceCriteria, CoaRecord, Laboratory, TestResult, TestStatus } from "@/lib/coa/types";
import { KNOWN_TESTS, TEST_STATUSES, TEST_STATUS_LABELS } from "@/lib/coa/types";
import type { Issue, ProductInfo } from "@/lib/coa/validate";
import type { CriterionCheck } from "@/lib/coa/criteria";

// Certificates tab (executive portal): the COA verification workflow.
// Upload PDF → extraction (values read from the PDF only, each with its source) → match product, strength and lot →
// review and correct → mark reviewed → approve or reject → publish. Nothing is approved or published automatically,
// and the server re-checks every rule (lib/coa/admin.ts). Synthetic test records are flagged and never public.

type AdminRecord = CoaRecord & {
  issues: Issue[];
  checks: CriterionCheck[];
  canApprove: boolean;
  file: { fileName: string; sizeBytes: number; pageCount: number | null; sha256: string } | null;
};
type AuditEntry = { id: string; action: string; actor: string; at: string; details: unknown };
type Overview = { records: AdminRecord[]; products: ProductInfo[]; labs: Laboratory[]; criteria: AcceptanceCriteria[]; serverToday: string };

const LABEL = "text-[10px] uppercase tracking-[0.1em] text-white/40";
const BUTTON = "border border-white/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-[var(--x-muted)] hover:text-[var(--x-text)] disabled:opacity-30";
const PRIMARY = "border border-[var(--x-muted)] bg-[var(--x-raised)] px-4 py-2 text-xs uppercase tracking-[0.12em] text-[var(--x-text)] hover:border-[var(--x-text)] disabled:opacity-30";

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function StatusLine({ r }: { r: AdminRecord }) {
  const errors = r.issues.filter((i) => i.level === "error").length;
  return (
    <div className="space-y-1 text-[11px]">
      <div className="flex flex-wrap gap-1">
        {r.isTest && <span className="border border-[var(--x-warning)]/60 px-1.5 py-0.5 text-[var(--x-warning)]">TEST DATA</span>}
        <span className={`border px-1.5 py-0.5 ${r.approvalStatus === "approved" ? "border-[var(--x-positive)]/50 text-[var(--x-positive)]" : r.approvalStatus === "rejected" ? "border-[var(--x-negative)]/50 text-[var(--x-negative)]" : "border-white/20 text-white/60"}`}>
          {r.approvalStatus}
        </span>
        <span className={`border px-1.5 py-0.5 ${r.publicVisibility === "public" ? "border-[var(--x-gold)] text-[var(--x-gold)]" : "border-white/15 text-white/40"}`}>{r.publicVisibility}</span>
      </div>
      <p className="text-white/50">
        {r.reviewStatus === "reviewed" ? "Reviewed" : "Needs review"}
        {r.approvalStatus === "pending" && ` · ${errors ? `${errors} issue${errors === 1 ? "" : "s"} to resolve` : "ready to approve"}`}
      </p>
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

  async function upload(files: FileList | File[]) {
    setError(null);
    setNotice(null);
    for (const file of Array.from(files)) {
      setUploading(file.name);
      const body = new FormData();
      body.set("file", file);
      if (isTest) body.set("isTest", "1");
      const res = await fetch("/api/executive/certificates", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(`${file.name}: ${json.error ?? "upload failed."}`);
        if (json.recordId) setSelected(json.recordId);
      } else {
        setNotice(`Uploaded ${file.name}. Review the extracted fields against the PDF before approving.`);
        setSelected(json.record.id);
      }
    }
    setUploading(null);
    await load();
  }

  async function quickAction(r: AdminRecord, action: string, reason?: string) {
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/executive/certificates/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(`${json.error ?? "That didn't work."}${json.issues ? ` ${json.issues.map((i: Issue) => i.message).join(" ")}` : ""}`);
      return false;
    }
    setNotice(`${action.replace("_", " ")}: ${r.compoundName ?? "record"} ${r.sizeLabel ?? ""} lot ${r.lotNumber ?? "—"} — done.`);
    await load();
    return true;
  }

  async function remove(r: AdminRecord) {
    if (!window.confirm(`Delete the ${r.approvalStatus} record for lot ${r.lotNumber ?? "(none)"}${r.isTest ? " [TEST]" : ""} and its PDF? This can't be undone (the audit trail keeps a note of it).`)) return;
    const res = await fetch(`/api/executive/certificates/${r.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Couldn't delete."); return; }
    if (selected === r.id) setSelected(null);
    setNotice(`Deleted the record for lot ${r.lotNumber ?? "(none)"}.`);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="command-panel p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Certificates of Analysis</p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/70">
          Upload a laboratory COA as a PDF. Values are read from the PDF only — anything not printed in it stays empty and
          is flagged. Check every field against the PDF, mark the record reviewed, then approve or reject it. Only approved
          records you publish appear in the public search and on the lot&apos;s page.
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
          className={`mt-5 flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-8 text-center transition-colors ${dragging ? "border-[var(--x-text)] bg-[var(--x-raised)]" : "border-white/20"}`}
        >
          <p className="text-sm text-white/70">{uploading ? `Uploading and reading ${uploading}…` : "Drop certificate PDFs here"}</p>
          <button type="button" disabled={Boolean(uploading)} onClick={() => fileInput.current?.click()} className={BUTTON}>
            Choose PDF files
          </button>
          <input ref={fileInput} type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ""; }} aria-label="Certificate PDF files" />
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} className="h-4 w-4 accent-[var(--x-warning)]" aria-label="Synthetic test record" />
            Synthetic test record — flagged as test data and never shown publicly
          </label>
          <p className="text-[11px] text-white/40">PDF only, up to 4 MB. The file is stored exactly as uploaded.</p>
        </div>

        {notice && <p role="status" className="mt-4 border border-[var(--x-positive)]/40 p-3 text-xs text-[var(--x-positive)]">{notice}</p>}
        {error && <p role="alert" className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}

        <div className="mt-6 overflow-x-auto">
          {!data ? (
            <p className="text-sm text-white/30">Loading…</p>
          ) : data.records.length === 0 ? (
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
                {data.records.map((r) => (
                  <tr key={r.id} data-certificate={r.id} className="border-b border-white/5 align-top">
                    <td className="py-3 pr-4">
                      <p className="text-white">{r.compoundName ?? "Product not set"}{r.sizeLabel ? ` · ${r.sizeLabel}` : ""}</p>
                      <p className="font-mono text-xs text-white/60">Lot {r.lotNumber ?? "—"}</p>
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
                    </td>
                    <td className="py-3 pr-4 text-xs text-white/60">
                      {when(r.updatedAt)}
                      <span className="block text-[10px] text-white/35">{r.updatedBy}</span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setSelected(r.id)} className={BUTTON}>Edit</button>
                        <button type="button" disabled={!r.canApprove} onClick={() => quickAction(r, "approve")} className={BUTTON} title={r.canApprove ? "" : "Resolve the issues in the editor first"}>Approve</button>
                        <button type="button" disabled={r.approvalStatus === "rejected"} onClick={() => setSelected(r.id)} className={BUTTON} title="Reject with a reason in the editor">Reject</button>
                        {r.approvalStatus === "approved" && (r.publicVisibility === "public"
                          ? <button type="button" onClick={() => quickAction(r, "unpublish")} className={BUTTON}>Unpublish</button>
                          : <button type="button" onClick={() => quickAction(r, "publish")} className={BUTTON}>Publish</button>)}
                        <button type="button" disabled={r.approvalStatus === "approved"} onClick={() => remove(r)} className={BUTTON} title={r.approvalStatus === "approved" ? "Approved certificates are retained" : ""}>Delete</button>
                      </div>
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
          onClose={() => setSelected(null)}
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

function RecordEditor({ id, overview, onClose, onChanged }: { id: string; overview: Overview; onClose: () => void; onChanged: (msg?: string) => Promise<void> }) {
  const [record, setRecord] = useState<AdminRecord | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");

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

  if (!record || !form) return <div className="command-panel p-6"><p className="text-sm text-white/40">{err ?? "Loading…"}</p></div>;
  const product = overview.products.find((p) => p.slug === form.productSlug);
  const locked = record.approvalStatus === "rejected";
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function send(body: object, success: string) {
    setBusy(true); setErr(null); setMsg(null);
    const res = await fetch(`/api/executive/certificates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(`${json.error ?? "That didn't work."}${json.issues ? " " + json.issues.map((i: Issue) => i.message).join(" ") : ""}`);
      return;
    }
    setMsg(success);
    await load();
    await onChanged();
  }

  function save() {
    const f = form!;
    send({
      fields: {
        lotNumber: f.lotNumber || null, productSlug: f.productSlug || null, sizeLabel: f.sizeLabel || null, laboratoryId: f.laboratoryId || null,
        labReportId: f.labReportId || null, testedOn: f.testedOn || null, issuedOn: f.issuedOn || null, purityResult: f.purityResult || null,
        quantityResult: f.quantityResult || null, appearance: f.appearance || null, verificationUrl: f.verificationUrl || null,
        inventoryStatus: f.inventoryStatus, historical: f.historical, dispositionOn: f.dispositionOn || null, testResults: f.testResults,
        // Explicit figures only when typed; otherwise the server reads them from the printed result.
        ...(f.purityPercent !== (record!.purityPercent?.toString() ?? "") ? { purityPercent: f.purityPercent === "" ? null : f.purityPercent } : {}),
        ...(f.quantityMg !== (record!.quantityMg?.toString() ?? "") ? { quantityMg: f.quantityMg === "" ? null : f.quantityMg } : {}),
      },
    }, "Saved.");
  }

  const input = (k: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className={LABEL}>{label}</span>
      <input value={String(form[k] ?? "")} disabled={locked} onChange={(e) => set(k, e.target.value as never)} className="input-field mt-1" aria-label={label} {...props} />
    </label>
  );
  const found = record.extraction?.found ?? {};
  const source = (key: string) => found[key] ? <span className="mt-1 block text-[10px] text-white/35">PDF: &ldquo;{found[key].source}&rdquo;</span> : null;

  return (
    <div className="command-panel p-6" data-editor={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">
          Certificate — {record.compoundName ?? "product not set"} {record.sizeLabel ?? ""} · lot {record.lotNumber ?? "—"} {record.isTest && <span className="text-[var(--x-warning)]">· TEST DATA</span>}
        </p>
        <div className="flex gap-2">
          {record.fileId && <a href={`/api/executive/certificates/${id}/pdf`} target="_blank" rel="noopener" className={BUTTON}>Open PDF</a>}
          <button type="button" onClick={onClose} className={BUTTON}>Close</button>
        </div>
      </div>
      {record.file && <p className="mt-1 text-[11px] text-white/40">{record.file.fileName} · {(record.file.sizeBytes / 1024).toFixed(0)} KB · {record.file.pageCount ?? "?"} page(s) · SHA-256 {record.file.sha256.slice(0, 16)}…</p>}
      {locked && <p className="mt-3 text-xs text-[var(--x-negative)]">Rejected: {record.rejectionReason}. This record is closed.</p>}

      {msg && <p role="status" className="mt-4 border border-[var(--x-positive)]/40 p-3 text-xs text-[var(--x-positive)]">{msg}</p>}
      {err && <p role="alert" className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{err}</p>}

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
        <div className="sm:col-span-2">
          {input("verificationUrl", "Laboratory verification link (exact certificate record)", { type: "url", placeholder: "https://…" })}
          {source("verificationUrl")}
          <p className="mt-1 text-[11px] text-white/50">
            Status: {record.verificationStatus}{record.verificationNote ? ` — ${record.verificationNote}` : ""}
            {record.verificationCheckedAt ? ` (checked ${when(record.verificationCheckedAt)})` : ""}
          </p>
        </div>
        <div className="flex items-end">
          <button type="button" disabled={busy || !record.verificationUrl} onClick={() => send({ action: "check_link" }, "Link checked.")} className={BUTTON}>Check link</button>
        </div>
        <label className="block">
          <span className={LABEL}>Inventory availability</span>
          <select value={form.inventoryStatus} onChange={(e) => set("inventoryStatus", e.target.value)} className="input-field mt-1" aria-label="Inventory availability">
            <option value="auto">Automatic (from catalog and stock)</option>
            <option value="available">Available</option>
            <option value="unavailable">Not currently available</option>
          </select>
        </label>
        <label className="input-field flex items-center gap-3 self-end">
          <input type="checkbox" checked={form.historical} onChange={(e) => set("historical", e.target.checked)} className="h-4 w-4" aria-label="Historical lot" />
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
        <button type="button" disabled={busy || record.approvalStatus !== "pending" || record.reviewStatus === "reviewed"} onClick={() => send({ action: "mark_reviewed" }, "Marked reviewed.")} className={PRIMARY}>Mark reviewed</button>
        <button type="button" disabled={busy || !record.canApprove} onClick={() => send({ action: "approve" }, "Approved. Publish it to make it public.")} className={PRIMARY}>Approve</button>
        {record.approvalStatus === "approved" && (record.publicVisibility === "public"
          ? <button type="button" disabled={busy} onClick={() => send({ action: "unpublish" }, "Unpublished.")} className={PRIMARY}>Unpublish</button>
          : <button type="button" disabled={busy} onClick={() => send({ action: "publish" }, record.isTest ? "Published — but test data never appears publicly." : "Published.")} className={PRIMARY}>Publish</button>)}
      </div>
      {!locked && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection" className="input-field max-w-md" aria-label="Rejection reason" />
          <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => send({ action: "reject", reason }, "Rejected.")} className={BUTTON}>Reject</button>
        </div>
      )}

      {/* Validation */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className={LABEL}>Checks against acceptance criteria</p>
          {record.checks.length === 0 ? <p className="mt-2 text-xs text-white/50">No criteria apply to this product, or no product is set.</p> : (
            <ul className="mt-2 space-y-1 text-xs">
              {record.checks.map((c) => (
                <li key={c.key} className={c.status === "passed" ? "text-[var(--x-positive)]" : c.status === "failed" ? "text-[var(--x-negative)]" : "text-[var(--x-warning)]"}>
                  {TEST_STATUS_LABELS[c.status]} — {c.label}: {c.detail}
                </li>
              ))}
            </ul>
          )}
          <p className={`${LABEL} mt-5`}>Issues</p>
          {record.issues.length === 0 ? <p className="mt-2 text-xs text-[var(--x-positive)]">None.</p> : (
            <ul className="mt-2 space-y-1 text-xs" data-issues>
              {record.issues.map((i, n) => (
                <li key={n} className={i.level === "error" ? "text-red-300" : "text-white/60"}>{i.level === "error" ? "Error" : "Note"} — {i.message}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className={LABEL}>Extraction ({record.extraction?.method ?? "none"}{record.extraction?.model ? `, ${record.extraction.model}` : ""})</p>
          {record.extraction ? (
            <div className="mt-2 space-y-2 text-xs text-white/60">
              <p>Found in the PDF: {Object.keys(record.extraction.found).join(", ") || "nothing"}.</p>
              {record.extraction.missing.length > 0 && <p>Not in the PDF (left empty): {record.extraction.missing.join(", ")}.</p>}
              {record.extraction.rejected.map((r, n) => <p key={n} className="text-[var(--x-warning)]">Discarded {r.field} &ldquo;{r.value}&rdquo;: {r.reason}.</p>)}
              {record.extraction.notes.map((note, n) => <p key={n}>{note}</p>)}
            </div>
          ) : <p className="mt-2 text-xs text-white/50">No extraction.</p>}
          <p className={`${LABEL} mt-5`}>Audit trail</p>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-[11px] text-white/50">
            {auditLog.map((a) => <li key={a.id}>{when(a.at)} · {a.actor} · {a.action}</li>)}
          </ul>
        </div>
      </div>
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
