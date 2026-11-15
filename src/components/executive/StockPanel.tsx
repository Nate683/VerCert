"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ADJUSTMENT_LABELS,
  ADJUSTMENT_REASONS,
  ADJUSTMENT_TYPES,
  MOVEMENT_LABELS,
  STOCK_LEVEL_LABELS,
  type AdjustmentType,
  type InventoryMovement,
  type StockLevel,
  type StrengthStockRow,
} from "@/lib/inventory-shared";
import { AVAILABILITY_LABELS, type AvailabilityStatus } from "@/lib/products/availability";

// Executive Office → Stock (Stage 2): stock per strength (SKU). View by product and strength, search by name or
// SKU, filter by level, open one SKU for its details, adjustments, low-stock threshold and full movement history.
// Every change is a recorded adjustment (reason, note, who, when); history is append-only. Stock levels never change
// a strength's storefront availability — that stays the Availability status set in Inventory → Edit Product.
// The open SKU is kept in ?strength=<id> (with ?tab=stock), so a browser refresh comes back to it.

type Filter = "all" | StockLevel | "deactivated";
const LEVEL_STYLE: Record<StockLevel, string> = {
  healthy: "border-white/20 text-white/70",
  low: "border-[var(--x-warning,#d9a441)] text-[var(--x-warning,#d9a441)]",
  zero: "border-[var(--x-negative,#e0675f)] text-[var(--x-negative,#e0675f)]",
};
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const setStrengthParam = (id: string | null) => {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("strength", id);
  else url.searchParams.delete("strength");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
};

function LevelBadge({ level }: { level: StockLevel }) {
  return (
    <span className={`inline-block border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] ${LEVEL_STYLE[level]}`} data-level={level}>
      {STOCK_LEVEL_LABELS[level]}
    </span>
  );
}

export function StockPanel({ variant }: { variant: "command" | "office" }) {
  const cardClass = variant === "command" ? "command-panel p-6" : "office-card";
  const [rows, setRows] = useState<StrengthStockRow[]>([]);
  const [recent, setRecent] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/executive/inventory", { cache: "no-store" });
    if (!res.ok) {
      setLoadError(`Stock couldn't be loaded (${res.status}).`);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setRows(data.rows ?? []);
    setRecent(data.recent ?? []);
    setLoadError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
    const id = new URLSearchParams(window.location.search).get("strength");
    if (id) setOpenId(id);
  }, [load]);

  const open = (id: string | null) => {
    setOpenId(id);
    setStrengthParam(id);
  };

  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (q && !`${r.productName} ${r.sku} ${r.label}`.toLowerCase().includes(q)) return false;
        if (filter === "deactivated") return !r.strengthActive;
        if (filter !== "all") return r.strengthActive && r.level === filter;
        return true;
      }),
    [rows, q, filter]
  );
  const groups = useMemo(() => {
    const m = new Map<string, StrengthStockRow[]>();
    for (const r of shown) m.set(r.productSlug, [...(m.get(r.productSlug) ?? []), r]);
    return [...m.values()];
  }, [shown]);
  const activeRows = rows.filter((r) => r.strengthActive);
  const count = (l: StockLevel) => activeRows.filter((r) => r.level === l).length;
  const openRow = rows.find((r) => r.strengthId === openId) ?? null;

  return (
    <div className="space-y-6" data-stock-panel>
      <div className={cardClass}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Stock by strength</p>
          <p className="text-[11px] text-white/40" data-stock-summary>
            {activeRows.length} active SKUs · {count("healthy")} healthy · {count("low")} low · {count("zero")} zero ·{" "}
            {activeRows.reduce((a, r) => a + r.available, 0)} units available
          </p>
        </div>
        <p className="mt-1 text-[11px] text-white/35">
          Stock never changes what the shop says about a strength: availability is set per strength in Inventory → Edit Product.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product or SKU"
            aria-label="Search product or SKU"
            className="input-field max-w-xs flex-1"
          />
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filter by stock level" className="input-field w-auto">
            <option value="all">All SKUs</option>
            <option value="healthy">Healthy</option>
            <option value="low">Low stock</option>
            <option value="zero">Zero stock</option>
            <option value="deactivated">Deactivated strengths</option>
          </select>
        </div>

        {loadError && <p className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{loadError}</p>}

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-white/30">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-white/40">No SKUs match.</p>
          ) : (
            <table className="w-full min-w-[760px] text-left text-xs" data-stock-table>
              <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40">
                <tr>
                  <th className="py-2 pr-3 font-normal">Product / strength</th>
                  <th className="py-2 pr-3 font-normal">SKU</th>
                  <th className="py-2 pr-3 font-normal">Shop status</th>
                  <th className="py-2 pr-3 text-right font-normal">Physical</th>
                  <th className="py-2 pr-3 text-right font-normal">Reserved</th>
                  <th className="py-2 pr-3 text-right font-normal">Available</th>
                  <th className="py-2 pr-3 text-right font-normal">Low at</th>
                  <th className="py-2 pr-3 font-normal">Level</th>
                  <th className="py-2 font-normal" />
                </tr>
              </thead>
              {groups.map((g) => {
                const live = g.filter((r) => r.strengthActive);
                return (
                  <tbody key={g[0].productSlug} className="border-t border-white/10" data-stock-product={g[0].productSlug}>
                    <tr className="text-white/80">
                      <td className="py-2 pr-3 font-serif text-sm text-white" colSpan={3}>
                        {g[0].productName}
                        {!g[0].productActive && <span className="ml-2 text-[9px] uppercase tracking-[0.12em] text-white/40">hidden</span>}
                      </td>
                      {/* Product totals: active strengths only. */}
                      <td className="py-2 pr-3 text-right text-white/60" data-total="physical">{live.reduce((a, r) => a + r.physical, 0)}</td>
                      <td className="py-2 pr-3 text-right text-white/60" data-total="reserved">{live.reduce((a, r) => a + r.reserved, 0)}</td>
                      <td className="py-2 pr-3 text-right text-white/60" data-total="available">{live.reduce((a, r) => a + r.available, 0)}</td>
                      <td colSpan={3} className="py-2 text-[9px] uppercase tracking-[0.12em] text-white/30">product total</td>
                    </tr>
                    {g.map((r) => (
                      <tr key={r.strengthId} className={`border-t border-white/5 ${r.strengthActive ? "" : "opacity-60"}`} data-stock-row={r.strengthId}>
                        <td className="py-2 pl-4 pr-3 text-white/80">
                          {r.label}
                          {!r.strengthActive && <span className="ml-2 text-[9px] uppercase tracking-[0.12em] text-white/40">deactivated</span>}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[10px] text-white/60">{r.sku}</td>
                        <td className="py-2 pr-3 text-white/60">{AVAILABILITY_LABELS[r.availabilityStatus as AvailabilityStatus] ?? r.availabilityStatus}</td>
                        <td className="py-2 pr-3 text-right text-white/80">{r.physical}</td>
                        <td className="py-2 pr-3 text-right text-white/50">{r.reserved}</td>
                        <td className="py-2 pr-3 text-right text-white" data-available>{r.available}</td>
                        <td className="py-2 pr-3 text-right text-white/50">{r.threshold}</td>
                        <td className="py-2 pr-3"><LevelBadge level={r.level} /></td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => open(r.strengthId)}
                            data-open-sku={r.sku}
                            className="border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-[var(--x-muted)] hover:text-[var(--x-text)]"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          )}
        </div>
      </div>

      {openId && (
        <SkuDetail
          key={openId}
          strengthId={openId}
          fallback={openRow}
          cardClass={cardClass}
          onClose={() => open(null)}
          onChanged={load}
        />
      )}

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Recent activity</p>
        <MovementList movements={recent} showSku />
      </div>
    </div>
  );
}

function MovementList({ movements, showSku = false }: { movements: InventoryMovement[]; showSku?: boolean }) {
  if (movements.length === 0) return <p className="mt-3 text-sm text-white/40">No stock movements yet.</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs" data-movements>
        <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40">
          <tr>
            <th className="py-1.5 pr-3 font-normal">When</th>
            {showSku && <th className="py-1.5 pr-3 font-normal">SKU</th>}
            <th className="py-1.5 pr-3 font-normal">Movement</th>
            <th className="py-1.5 pr-3 text-right font-normal">Change</th>
            <th className="py-1.5 pr-3 text-right font-normal">Before → after</th>
            <th className="py-1.5 pr-3 font-normal">Reason / note</th>
            <th className="py-1.5 font-normal">By</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} className="border-t border-white/5 align-top" data-movement={m.type}>
              <td className="py-1.5 pr-3 whitespace-nowrap text-white/50">{when(m.createdAt)}</td>
              {showSku && <td className="py-1.5 pr-3 font-mono text-[10px] text-white/60">{m.sku}</td>}
              <td className="py-1.5 pr-3 text-white/80">{MOVEMENT_LABELS[m.type] ?? m.type}</td>
              <td className={`py-1.5 pr-3 text-right ${m.change > 0 ? "text-white" : m.change < 0 ? "text-[var(--x-negative,#e0675f)]" : "text-white/40"}`}>
                {m.change > 0 ? `+${m.change}` : m.change}
              </td>
              <td className="py-1.5 pr-3 whitespace-nowrap text-right text-white/60">{m.previous} → {m.resulting}</td>
              <td className="py-1.5 pr-3 text-white/70">
                {m.reason}
                {m.note && <span className="block text-white/45">{m.note}</span>}
                {m.reference && <span className="block text-white/35">Ref {m.reference}</span>}
              </td>
              <td className="py-1.5 text-white/50">{m.actor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One SKU: its numbers, an adjustment form, the low-stock threshold, and its full history.
function SkuDetail({
  strengthId,
  fallback,
  cardClass,
  onClose,
  onChanged,
}: {
  strengthId: string;
  fallback: StrengthStockRow | null;
  cardClass: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [row, setRow] = useState<StrengthStockRow | null>(fallback);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [missing, setMissing] = useState(false);
  const [type, setType] = useState<AdjustmentType>("stock_received");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<string>(ADJUSTMENT_REASONS.stock_received[0]);
  const [note, setNote] = useState("");
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState<null | "adjust" | "threshold">(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // One key per intended submission: a double click sends the same key and is recorded once.
  const [adjustKey, setAdjustKey] = useState(newKey);
  const [thresholdKey, setThresholdKey] = useState(newKey);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/executive/inventory/${encodeURIComponent(strengthId)}`, { cache: "no-store" });
    if (res.status === 404) return setMissing(true);
    if (!res.ok) return;
    const data = await res.json();
    setRow(data.row);
    setMovements(data.movements ?? []);
    setThreshold(String(data.row.threshold));
  }, [strengthId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load this SKU on open
    refresh();
  }, [refresh]);

  if (missing) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-white/60">That SKU wasn&apos;t found.</p>
        <button type="button" onClick={onClose} className="mt-3 border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70">Close</button>
      </div>
    );
  }
  if (!row) return <div className={cardClass}><p className="text-sm text-white/30">Loading…</p></div>;

  const qty = Number(quantity);
  const preview =
    quantity.trim() === "" || !Number.isInteger(qty) || qty < 0
      ? null
      : type === "stock_received" ? row.physical + qty : type === "stock_removed" ? row.physical - qty : qty;

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy("adjust");
    setMessage(null);
    try {
      const res = await fetch(`/api/executive/inventory/${encodeURIComponent(strengthId)}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          quantity: quantity.trim() === "" ? NaN : Number(quantity),
          reason,
          ...(note.trim() ? { note: note.trim() } : {}),
          idempotencyKey: adjustKey,
          ...(type === "count_correction" ? { expectedVersion: row!.version } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? `The adjustment wasn't recorded (${res.status}).` });
        if (data.code === "stale") await refresh();
        return;
      }
      setMessage({ ok: true, text: `Recorded: ${data.movement.previous} → ${data.movement.resulting}.` });
      setQuantity("");
      setNote("");
      setAdjustKey(newKey());
      await Promise.all([refresh(), onChanged()]);
    } finally {
      setBusy(null);
    }
  }

  async function submitThreshold(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy("threshold");
    setMessage(null);
    try {
      const res = await fetch(`/api/executive/inventory/${encodeURIComponent(strengthId)}/threshold`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold: threshold.trim() === "" ? NaN : Number(threshold), idempotencyKey: thresholdKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMessage({ ok: false, text: data.error ?? `The threshold wasn't saved (${res.status}).` });
      setMessage({ ok: true, text: `Low-stock threshold saved: ${data.row.threshold}.` });
      setThresholdKey(newKey());
      await Promise.all([refresh(), onChanged()]);
    } finally {
      setBusy(null);
    }
  }

  const field = (text: string) => <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">{text}</span>;
  return (
    <div className={cardClass} data-sku-detail={row.strengthId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--x-muted)]">SKU detail</p>
          <p className="mt-1 font-serif text-lg text-white">
            {row.productName} — {row.label} {!row.strengthActive && <span className="text-xs text-white/40">(deactivated)</span>}
          </p>
          <p className="font-mono text-[10px] text-white/50">{row.sku} · {row.strengthId}</p>
        </div>
        <button type="button" onClick={onClose} className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:text-white">
          Close
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5" data-sku-numbers>
        {[
          ["Physical", row.physical],
          ["Reserved", row.reserved],
          ["Available", row.available],
          ["Low at", row.threshold],
        ].map(([k, v]) => (
          <div key={k as string} className="border border-white/10 p-3">
            <dt className="text-[9px] uppercase tracking-[0.12em] text-white/40">{k}</dt>
            <dd className="mt-1 text-lg text-white" data-number={String(k).toLowerCase().replace(/\s+/g, "-")}>{v}</dd>
          </div>
        ))}
        <div className="border border-white/10 p-3">
          <dt className="text-[9px] uppercase tracking-[0.12em] text-white/40">Level</dt>
          <dd className="mt-2"><LevelBadge level={row.level} /></dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-white/35">
        Available = physical − reserved. Reserved stays 0 until order management (Stage 3). Shop status:{" "}
        {AVAILABILITY_LABELS[row.availabilityStatus as AvailabilityStatus] ?? row.availabilityStatus} — not changed by stock.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <form onSubmit={submitAdjustment} className="space-y-3 lg:col-span-2" data-adjust-form>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--x-muted)]">Adjust stock</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              {field("Adjustment")}
              <select
                value={type}
                onChange={(e) => {
                  const t = e.target.value as AdjustmentType;
                  setType(t);
                  setReason(ADJUSTMENT_REASONS[t][0]);
                }}
                aria-label="Adjustment"
                className="input-field mt-1"
              >
                {ADJUSTMENT_TYPES.map((t) => <option key={t} value={t}>{ADJUSTMENT_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="block">
              {field(type === "count_correction" ? "Counted quantity" : "Units")}
              <input
                type="number"
                min={type === "count_correction" ? 0 : 1}
                step={1}
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                aria-label={type === "count_correction" ? "Counted quantity" : "Units"}
                className="input-field mt-1"
              />
            </label>
            <label className="block">
              {field("Reason")}
              <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" className="input-field mt-1">
                {ADJUSTMENT_REASONS[type].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-3">
              {field(reason === "Other" ? "Note (required)" : "Note (optional)")}
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="Note" className="input-field mt-1" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy !== null}
              className="border border-[var(--x-muted)] bg-[var(--x-raised)] px-5 py-2 text-xs uppercase tracking-[0.15em] text-[var(--x-text)] hover:border-[var(--x-text)] disabled:opacity-40"
            >
              {busy === "adjust" ? "Recording…" : "Record adjustment"}
            </button>
            {preview !== null && (
              <span className={`text-[11px] ${preview < row.reserved ? "text-red-300" : "text-white/50"}`} data-adjust-preview>
                Physical {row.physical} → {preview}
                {preview < row.reserved ? " — not allowed (below reserved or zero)" : ""}
              </span>
            )}
          </div>
        </form>

        <form onSubmit={submitThreshold} className="space-y-3" data-threshold-form>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--x-muted)]">Low-stock threshold</p>
          <label className="block">
            {field("Low at (units available)")}
            <input type="number" min={0} step={1} value={threshold} onChange={(e) => setThreshold(e.target.value)} aria-label="Low-stock threshold" className="input-field mt-1" />
          </label>
          <button
            type="submit"
            disabled={busy !== null}
            className="border border-white/20 px-4 py-2 text-[10px] uppercase tracking-[0.12em] text-white/70 hover:border-[var(--x-muted)] hover:text-[var(--x-text)] disabled:opacity-40"
          >
            {busy === "threshold" ? "Saving…" : "Save threshold"}
          </button>
        </form>
      </div>

      {message && (
        <p role="status" className={`mt-4 border p-3 text-xs ${message.ok ? "border-white/20 text-white/80" : "border-red-500/40 bg-red-500/10 text-red-300"}`} data-adjust-message>
          {message.text}
        </p>
      )}

      <div className="mt-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--x-muted)]">Movement history</p>
        <MovementList movements={movements} />
      </div>
    </div>
  );
}
