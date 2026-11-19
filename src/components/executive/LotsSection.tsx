"use client";

import { useState } from "react";
import {
  LOT_RELEASE_LABELS,
  LOT_RELEASE_STATUSES,
  LOT_TESTING_LABELS,
  LOT_TESTING_STATUSES,
  type InventoryLot,
  type LotReleaseStatus,
  type LotTestingStatus,
} from "@/lib/inventory-shared";

// Executive Office → Stock → SKU detail → Lots (Stage 3). A strength's manufacturing lots in FIFO order (oldest
// received first — the order stock is allocated in). Only APPROVED lots are sellable; everything else is on hand
// but held back. Nothing here approves a lot automatically: approving one that hasn't passed testing (or the
// reconciliation / returns lot) needs a written justification, recorded with your name; and NO lot can be approved
// without a VeriCert lot number (owner decision D4).
//
// The reconciliation lot RECON-<SKU> holds the stock that existed before lots (owner decision A1, option 2):
// quarantined until it is split into real lots (Split) or approved with a justification.

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
const RELEASE_TONE: Record<LotReleaseStatus, string> = {
  approved: "border-[var(--x-positive,#6fbf8e)] text-[var(--x-positive,#6fbf8e)]",
  pending: "border-white/25 text-white/60",
  quarantined: "border-[var(--x-warning,#d9a441)] text-[var(--x-warning,#d9a441)]",
  rejected: "border-[var(--x-negative,#e0675f)] text-[var(--x-negative,#e0675f)]",
};
const field = (text: string) => <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">{text}</span>;

type Details = { manufacturerLot: string; vericertLotNumber: string; receivedAt: string; manufacturedOn: string; expiresOn: string; notes: string };
const emptyDetails: Details = { manufacturerLot: "", vericertLotNumber: "", receivedAt: "", manufacturedOn: "", expiresOn: "", notes: "" };
const detailsBody = (d: Details) =>
  Object.fromEntries(Object.entries(d).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, v.trim()]));

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function DetailFields({ value, onChange, withReceived = true }: { value: Details; onChange: (d: Details) => void; withReceived?: boolean }) {
  const input = (k: keyof Details, label: string, type = "text") => (
    <label className="block">
      {field(label)}
      <input type={type} value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} aria-label={label} className="input-field mt-1" />
    </label>
  );
  return (
    <>
      {input("manufacturerLot", "Manufacturer batch / lot")}
      {input("vericertLotNumber", "VeriCert lot number (certificate)")}
      {withReceived && input("receivedAt", "Received on", "date")}
      {input("manufacturedOn", "Manufactured on", "date")}
      {input("expiresOn", "Expires on", "date")}
      {input("notes", "Notes")}
    </>
  );
}

export function LotsSection({ strengthId, lots, onChanged }: { strengthId: string; lots: InventoryLot[]; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<null | { kind: "receive" } | { kind: "manage"; lotId: string } | { kind: "split"; lotId: string }>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newKey);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [release, setRelease] = useState<LotReleaseStatus>("pending");
  const [testing, setTesting] = useState<LotTestingStatus>("untested");

  const open = (m: typeof mode) => {
    setMode(m);
    setMessage(null);
    setQty("");
    setReason("");
    setDetails(emptyDetails);
    setKey(newKey());
    if (m && m.kind === "manage") {
      const l = lots.find((x) => x.id === m.lotId);
      if (l) {
        setRelease(l.releaseStatus);
        setTesting(l.testingStatus);
        setDetails({
          manufacturerLot: l.manufacturerLot ?? "", vericertLotNumber: l.vericertLotNumber ?? "", receivedAt: "",
          manufacturedOn: l.manufacturedOn ?? "", expiresOn: l.expiresOn ?? "", notes: l.notes ?? "",
        });
      }
    }
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!mode || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      let r;
      if (mode.kind === "receive") {
        r = await send(`/api/executive/inventory/${encodeURIComponent(strengthId)}/lots`, "POST", { quantity: Number(qty), ...detailsBody(details), idempotencyKey: key });
      } else if (mode.kind === "split") {
        r = await send(`/api/executive/lots/${encodeURIComponent(mode.lotId)}/split`, "POST", { quantity: Number(qty), reason, ...detailsBody(details), idempotencyKey: key });
      } else {
        const lot = lots.find((x) => x.id === mode.lotId)!;
        r = await send(`/api/executive/lots/${encodeURIComponent(mode.lotId)}`, "PATCH", {
          ...(release !== lot.releaseStatus ? { releaseStatus: release } : {}),
          ...(testing !== lot.testingStatus ? { testingStatus: testing } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...detailsBody({ ...details, receivedAt: "" }),
          idempotencyKey: key,
        });
      }
      if (!r.ok) return setMessage({ ok: false, text: r.data.error ?? `Not saved (${r.status}).` });
      const code = r.data.result?.lot_code ?? r.data.lot?.lotCode;
      setMessage({
        ok: true,
        text: mode.kind === "receive" ? `Received into new lot ${code} (pending — not sellable until approved).`
          : mode.kind === "split" ? `Moved into new lot ${code} (pending — not sellable until approved).`
          : r.data.result?.outcome === "unchanged" ? "Nothing changed." : `Saved: ${(r.data.result?.changes ?? []).join("; ")}.`,
      });
      setMode(null);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  const managed = mode && mode.kind !== "receive" ? lots.find((l) => l.id === mode.lotId) : null;
  const approving = mode?.kind === "manage" && managed && release === "approved" && managed.releaseStatus !== "approved";
  const needsJustification = approving && (testing !== "passed" || managed!.kind !== "received");
  // D4: no lot is approved without a VeriCert lot number (the server refuses it too).
  const missingVericert = Boolean(approving && !managed!.vericertLotNumber && !details.vericertLotNumber.trim());

  return (
    <div className="mt-6" data-lots>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--x-muted)]">Lots (FIFO: oldest first)</p>
        <button type="button" onClick={() => open({ kind: "receive" })} data-receive-lot
          className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:text-white">
          Receive new lot
        </button>
      </div>
      {lots.length === 0 ? (
        <p className="mt-3 text-sm text-white/40">No lots yet. Stock arrives as a received lot.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs" data-lots-table>
            <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40">
              <tr>
                <th className="py-1.5 pr-3 font-normal">Lot</th>
                <th className="py-1.5 pr-3 font-normal">Batch / VeriCert lot</th>
                <th className="py-1.5 pr-3 font-normal">Received</th>
                <th className="py-1.5 pr-3 text-right font-normal">Physical</th>
                <th className="py-1.5 pr-3 text-right font-normal">Reserved</th>
                <th className="py-1.5 pr-3 font-normal">Testing</th>
                <th className="py-1.5 pr-3 font-normal">Release</th>
                <th className="py-1.5 pr-3 font-normal">Certificates</th>
                <th className="py-1.5 font-normal" />
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.id} className="border-t border-white/5 align-top" data-lot={l.lotCode} data-eligible={l.eligible ? "1" : "0"}>
                  <td className="py-1.5 pr-3 font-mono text-[10px] text-white">
                    {l.lotCode}
                    {l.kind !== "received" && <span className="block text-[9px] uppercase tracking-[0.1em] text-white/40">{l.kind === "reconciliation" ? "pre-Stage-3 stock" : "returns"}</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-white/70">{l.manufacturerLot ?? "—"}<span className="block text-white/45">{l.vericertLotNumber ?? "no VeriCert lot"}</span></td>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-white/50">{day(l.receivedAt)}{l.expiresOn && <span className="block">exp {l.expiresOn}</span>}</td>
                  <td className="py-1.5 pr-3 text-right text-white">{l.physical}</td>
                  <td className="py-1.5 pr-3 text-right text-white/60">{l.reserved}</td>
                  <td className="py-1.5 pr-3 text-white/70">{LOT_TESTING_LABELS[l.testingStatus]}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`inline-block border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] ${RELEASE_TONE[l.releaseStatus]}`}>{LOT_RELEASE_LABELS[l.releaseStatus]}</span>
                    <span className="block text-[10px] text-white/40">{l.eligible ? "sellable" : "not sellable"}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-white/60">
                    {l.certificates.length === 0 ? "none on file" : l.certificates.map((c) => (
                      <span key={c.id} className="block">{c.labReportId ?? "report"} · {c.approvalStatus ?? "?"}{c.isTest ? " · TEST" : ""}</span>
                    ))}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => open({ kind: "manage", lotId: l.id })} data-manage-lot={l.lotCode}
                      className="mr-1 border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:text-white">Manage</button>
                    {l.physical - l.reserved > 0 && (
                      <button type="button" onClick={() => open({ kind: "split", lotId: l.id })} data-split-lot={l.lotCode}
                        className="border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:text-white">Split</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode && (
        <form onSubmit={submit} className="mt-4 border border-white/15 p-4" data-lot-form={mode.kind}>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--x-muted)]">
            {mode.kind === "receive" ? "Receive stock as a new lot" : mode.kind === "split" ? `Split ${managed?.lotCode} into a new lot` : `Manage ${managed?.lotCode}`}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {mode.kind !== "manage" && (
              <label className="block">
                {field(mode.kind === "split" ? `Units to move (max ${managed ? managed.physical - managed.reserved : 0})` : "Units received")}
                <input type="number" min={1} step={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Units" className="input-field mt-1" />
              </label>
            )}
            {mode.kind === "manage" && (
              <>
                <label className="block">
                  {field("Testing status")}
                  <select value={testing} onChange={(e) => setTesting(e.target.value as LotTestingStatus)} aria-label="Testing status" className="input-field mt-1">
                    {LOT_TESTING_STATUSES.map((s) => <option key={s} value={s}>{LOT_TESTING_LABELS[s]}</option>)}
                  </select>
                </label>
                <label className="block">
                  {field("Release status")}
                  <select value={release} onChange={(e) => setRelease(e.target.value as LotReleaseStatus)} aria-label="Release status" className="input-field mt-1">
                    {LOT_RELEASE_STATUSES.map((s) => <option key={s} value={s} disabled={s === "approved" && testing === "failed"}>{LOT_RELEASE_LABELS[s]}</option>)}
                  </select>
                </label>
              </>
            )}
            <DetailFields value={details} onChange={setDetails} withReceived={mode.kind !== "manage"} />
            {mode.kind !== "receive" && (
              <label className="block sm:col-span-3">
                {field(mode.kind === "split" ? "Reason (required)" : needsJustification ? "Justification (required, at least 10 characters)" : "Reason (recorded with the change)")}
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-label="Reason" className="input-field mt-1" />
              </label>
            )}
          </div>
          {needsJustification && (
            <p className="mt-2 text-[11px] text-[var(--x-warning,#d9a441)]">
              {managed!.kind === "received" ? "This lot hasn't passed testing." : "This is the reconciliation/returns lot — its units have no verified batch."} Approving makes its units sellable.
            </p>
          )}
          {missingVericert && (
            <p className="mt-2 text-[11px] text-[var(--x-negative,#e0675f)]" data-needs-vericert>
              A lot can&apos;t be approved without a VeriCert lot number — it is what customers verify against. Enter it above.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={busy || missingVericert}
              className="border border-[var(--x-muted)] bg-[var(--x-raised)] px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-[var(--x-text)] disabled:opacity-40">
              {busy ? "Saving…" : mode.kind === "receive" ? "Record received lot" : mode.kind === "split" ? "Move units" : "Save lot"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="border border-white/15 px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-white/50">Cancel</button>
          </div>
        </form>
      )}
      {message && (
        <p role="status" className={`mt-3 border p-3 text-xs ${message.ok ? "border-white/20 text-white/80" : "border-red-500/40 bg-red-500/10 text-red-300"}`} data-lot-message>
          {message.text}
        </p>
      )}
    </div>
  );
}
