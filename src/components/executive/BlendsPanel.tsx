"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMg, validateComposition, type BlendRow } from "@/lib/products/blend-composition-shared";

// Executive Office → Blends (Website Refinements Package 1). Each blend strength's composition as structured records:
// every ingredient is chosen from the catalog by its permanent product id (no free-text names, no fuzzy matching), with
// an amount in mg and a display order. The ingredients must add up to the declared total; the same rules are enforced
// again by the server and the database. Saving moves no stock — a blend is its own SKU.
// A blend with no composition is flagged here; its customer page shows no composition section until it's completed.

type Choice = { slug: string; name: string; active: boolean };
type Draft = { declaredTotalMg: string; ingredients: { componentSlug: string; amountMg: string }[] };

const toDraft = (row: BlendRow): Draft => ({
  declaredTotalMg: row.composition ? String(row.composition.declaredTotalMg) : "",
  ingredients: row.composition ? row.composition.ingredients.map((i) => ({ componentSlug: i.componentSlug, amountMg: String(i.amountMg) })) : [{ componentSlug: "", amountMg: "" }],
});
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

export function BlendsPanel({ variant }: { variant: "command" | "office" }) {
  const cardClass = variant === "command" ? "command-panel p-6" : "office-card";
  const [rows, setRows] = useState<BlendRow[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/executive/blends", { cache: "no-store" });
    if (!res.ok) {
      setError(`Blends couldn't be loaded (${res.status}).`);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setRows(data.blends);
    setChoices(data.choices);
    setError(null);
    setLoading(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load; state is set when the fetch resolves
  useEffect(() => { void load(); }, [load]);

  const row = rows.find((r) => r.strengthId === editing) ?? null;
  const names = useMemo(() => new Map(choices.map((c) => [c.slug, c.name])), [choices]);
  const parsed = draft && { declaredTotalMg: num(draft.declaredTotalMg), ingredients: draft.ingredients.map((i) => ({ componentSlug: i.componentSlug, amountMg: num(i.amountMg) })) };
  const clientErrors = parsed && row ? validateComposition(parsed, { blendSlug: row.productSlug, productNames: names }) : [];
  const runningSum = parsed ? parsed.ingredients.reduce((a, i) => a + (Number.isFinite(i.amountMg) ? i.amountMg : 0), 0) : 0;

  function open(r: BlendRow) {
    setEditing(r.strengthId);
    setDraft(toDraft(r));
    setServerErrors([]);
    setMessage(null);
    setConfirmClear(false);
  }
  const close = () => { setEditing(null); setDraft(null); setServerErrors([]); setConfirmClear(false); };
  const update = (fn: (d: Draft) => Draft) => setDraft((d) => (d ? fn(d) : d));
  const move = (i: number, by: -1 | 1) => update((d) => {
    const next = [...d.ingredients];
    const j = i + by;
    if (j < 0 || j >= next.length) return d;
    [next[i], next[j]] = [next[j], next[i]];
    return { ...d, ingredients: next };
  });

  async function save() {
    if (!row || !parsed || clientErrors.length) return;
    setBusy(true);
    setServerErrors([]);
    const res = await fetch(`/api/executive/blends/${row.strengthId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setServerErrors(data.errors ?? [data.error ?? `Save failed (${res.status}).`]); return; }
    setMessage(`Saved: ${row.productName} ${row.label} — ${data.composition.ingredients.map((i: { name: string; amountMg: number }) => `${i.name} ${formatMg(i.amountMg)}`).join(", ")} (${formatMg(data.composition.declaredTotalMg)} total).`);
    close();
    await load();
  }

  async function clear() {
    if (!row) return;
    setBusy(true);
    const res = await fetch(`/api/executive/blends/${row.strengthId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { setServerErrors([`Couldn't remove the composition (${res.status}).`]); return; }
    setMessage(`Composition removed from ${row.productName} ${row.label}. It is flagged for completion, and its product page shows no composition.`);
    close();
    await load();
  }

  const flagged = rows.filter((r) => r.flagged);
  return (
    <div className="space-y-6" data-blends-panel>
      <div className={cardClass}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Blend compositions</p>
          <p className="text-[11px] text-white/40" data-blend-summary>
            {rows.length} blend strength{rows.length === 1 ? "" : "s"} ·{" "}
            <span className={flagged.length ? "text-[var(--x-warning,#d9a441)]" : ""}>{flagged.length} need{flagged.length === 1 ? "s" : ""} a composition</span>
          </p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-white/50">
          Each ingredient is a catalog compound, referenced by its permanent product id. The amounts must add up to the
          blend&apos;s declared total. Saving changes no stock: a blend is its own SKU. A blend without a composition
          shows no composition section to customers.
        </p>
        {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}
        {message && <p role="status" className="mt-4 border border-white/20 p-3 text-xs text-white/80" data-blend-message>{message}</p>}

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-white/30">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-white/40">No blends in the catalog.</p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-xs" data-blends-table>
              <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40">
                <tr>
                  <th className="py-2 pr-3 font-normal">Blend</th>
                  <th className="py-2 pr-3 font-normal">SKU</th>
                  <th className="py-2 pr-3 font-normal">Composition</th>
                  <th className="py-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.strengthId} className="border-t border-white/5 align-top" data-blend={r.productSlug} data-flagged={r.flagged ? "1" : "0"}>
                    <td className="py-2 pr-3 text-white">
                      {r.productName} <span className="text-white/50">{r.label}</span>
                      {!r.productActive && <span className="ml-2 border border-white/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/50">Hidden</span>}
                      {!r.strengthActive && <span className="ml-2 border border-white/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-white/50">Deactivated</span>}
                    </td>
                    <td className="py-2 pr-3 font-mono text-[10px] text-white/70">{r.sku}</td>
                    <td className="py-2 pr-3">
                      {r.composition ? (
                        <span className="text-white/80" data-composition>
                          {r.composition.ingredients.map((i) => `${i.name} ${formatMg(i.amountMg)}`).join(" · ")}
                          <span className="text-white/40"> = {formatMg(r.composition.declaredTotalMg)}</span>
                        </span>
                      ) : (
                        <span className="border border-[var(--x-warning,#d9a441)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--x-warning,#d9a441)]" data-needs-composition>
                          Needs composition
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => open(r)} className="border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:text-white" data-edit-blend={r.productSlug}>
                        {r.composition ? "Edit" : "Add composition"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {row && draft && (
        <div className={cardClass} data-blend-editor={row.productSlug}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Composition · {row.productName} {row.label}</p>
          <p className="mt-1 font-mono text-[10px] text-white/40">{row.sku} · strength {row.strengthId}</p>
          {row.legacyComposition && (
            <p className="mt-3 text-[11px] text-white/40" data-legacy-composition>
              Earlier free-text entry (reference only; not shown to customers, not used to fill this in):{" "}
              {row.legacyComposition.map((c) => `${c.name} ${c.amount}`).join(", ")}
            </p>
          )}

          <label className="mt-4 block max-w-xs text-[10px] uppercase tracking-[0.12em] text-white/50">
            Declared total per vial (mg)
            <input type="number" min="0" step="any" inputMode="decimal" value={draft.declaredTotalMg}
              onChange={(e) => update((d) => ({ ...d, declaredTotalMg: e.target.value }))} className="input-field mt-1 w-full" data-total-input />
          </label>

          <ol className="mt-4 space-y-2" data-ingredients>
            {draft.ingredients.map((ing, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2" data-ingredient-row={i}>
                <span className="w-5 text-right text-[11px] text-white/40">{i + 1}.</span>
                <select value={ing.componentSlug} aria-label={`Ingredient ${i + 1} compound`}
                  onChange={(e) => update((d) => ({ ...d, ingredients: d.ingredients.map((x, j) => (j === i ? { ...x, componentSlug: e.target.value } : x)) }))}
                  className="input-field min-w-[220px] flex-1" data-ingredient-select>
                  <option value="">Choose a compound…</option>
                  {choices.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}{c.active ? "" : " (hidden)"} — {c.slug}</option>
                  ))}
                </select>
                <input type="number" min="0" step="any" inputMode="decimal" value={ing.amountMg} placeholder="mg" aria-label={`Ingredient ${i + 1} amount in mg`}
                  onChange={(e) => update((d) => ({ ...d, ingredients: d.ingredients.map((x, j) => (j === i ? { ...x, amountMg: e.target.value } : x)) }))}
                  className="input-field w-24" data-ingredient-amount />
                <span className="text-[11px] text-white/40">mg</span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="border border-white/15 px-2 py-1 text-[10px] text-white/60 disabled:opacity-30" data-move-up>↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === draft.ingredients.length - 1} aria-label="Move down" className="border border-white/15 px-2 py-1 text-[10px] text-white/60 disabled:opacity-30" data-move-down>↓</button>
                <button type="button" onClick={() => update((d) => ({ ...d, ingredients: d.ingredients.filter((_, j) => j !== i) }))} aria-label="Remove ingredient"
                  className="border border-white/15 px-2 py-1 text-[10px] uppercase text-white/60" data-remove-ingredient>Remove</button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => update((d) => ({ ...d, ingredients: [...d.ingredients, { componentSlug: "", amountMg: "" }] }))}
            className="mt-3 border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:text-white" data-add-ingredient>
            + Add ingredient
          </button>

          <p className="mt-4 text-xs text-white/60" data-running-sum>
            Ingredients: {formatMg(runningSum)} of {Number.isFinite(parsed?.declaredTotalMg ?? NaN) ? formatMg(parsed!.declaredTotalMg) : "—"} declared
          </p>
          {[...clientErrors, ...serverErrors].length > 0 && (
            <ul className="mt-3 space-y-1 border border-[var(--x-warning,#d9a441)] p-3 text-xs text-[var(--x-warning,#d9a441)]" data-blend-errors>
              {[...new Set([...serverErrors, ...clientErrors])].map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={busy || clientErrors.length > 0}
              className="border border-gold px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-gold disabled:opacity-40" data-save-blend>
              {busy ? "Saving…" : "Save composition"}
            </button>
            <button type="button" onClick={close} className="border border-white/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50">Cancel</button>
            {row.composition && (confirmClear ? (
              <button type="button" onClick={clear} disabled={busy} className="border border-[var(--x-negative,#e0675f)] px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--x-negative,#e0675f)]" data-confirm-clear>
                Confirm: remove composition
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmClear(true)} className="border border-white/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50" data-clear-blend>
                Remove composition
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
