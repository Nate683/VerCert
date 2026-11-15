"use client";

import { useState } from "react";
import type { Product, SizeOption } from "@/lib/types";
import { AVAILABILITY_LABELS, AVAILABILITY_STATUSES, type AvailabilityStatus } from "@/lib/products/availability";
import { StrengthImageControl } from "./StrengthImageControl";

// One strength (SKU) in the product editor (Stage 1). id/sku are set by the server and shown read-only; a strength
// without an id hasn't been saved yet.
export type SizeForm = {
  id?: string;
  sku?: string;
  savedLabel?: string; // the label as last saved, to warn about a rename
  label: string;
  priceUsd: string; // blank = not yet priced
  bulkTiers: string; // "minQty:price, minQty:price"
  costUsd: string; // blank = use the product's cost
  // Stage 2: read-only stock (available/physical/reserved/threshold); changed only in the Stock tab.
  stock?: { physical: number; reserved: number; available: number; threshold: number; level: "healthy" | "low" | "zero" } | null;
  active: boolean;
  availabilityStatus: AvailabilityStatus;
  estimatedAvailableOn: string; // "YYYY-MM-DD", or "" for none
  imageUrl?: string | null; // saved on its own (StrengthImageControl), not by Save Product
  composition?: SizeOption["composition"]; // not edited here; carried through a save
};

const fieldLabel = (text: string) => <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">{text}</span>;

// One strength's expandable panel in Sizes & Pricing. Saved strengths start collapsed, a new one open. Strengths are
// never deleted: a saved one is deactivated instead (its id, SKU, orders and certificates are kept); only a strength
// that hasn't been saved yet can be removed. Edits here change the form only; Save Product saves them all together.
export function StrengthPanel({
  index,
  size,
  product,
  onChange,
  onRemove,
  onImageChange,
  duplicate = false,
}: {
  index: number;
  size: SizeForm;
  duplicate?: boolean;
  product: Product | null;
  onChange: (patch: Partial<SizeForm>) => void;
  onRemove?: () => void;
  onImageChange: (updated: Product) => void;
}) {
  const [open, setOpen] = useState(!size.id);
  const key = size.id ?? `new-${index}`;
  const bodyId = `strength-panel-${key}`;
  const renamed = Boolean(size.savedLabel && size.label.trim() && size.label.trim() !== size.savedLabel);
  const saved = product?.sizes.find((s) => s.id === size.id);
  return (
    <div
      data-strength-panel={key}
      className={`border ${size.active ? "border-white/10" : "border-white/5 opacity-75"} bg-[var(--x-base)]/40`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        data-strength-toggle
        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-[var(--x-raised)]"
      >
        <span className="flex items-center gap-3">
          <span aria-hidden="true" className="text-white/40">{open ? "▾" : "▸"}</span>
          <span className="text-sm text-white">{size.label.trim() || "New strength"}</span>
          <span className="font-mono text-[10px] text-white/40">{size.sku ?? "SKU assigned on save"}</span>
        </span>
        <span className="flex items-center gap-3 text-[10px] uppercase tracking-[0.12em] text-white/50">
          <span>{size.priceUsd.trim() ? `$${size.priceUsd}` : "Unpriced"}</span>
          <span>{AVAILABILITY_LABELS[size.availabilityStatus]}</span>
          {!size.active && <span className="border border-white/20 px-1.5 py-0.5 text-white/60">Deactivated</span>}
        </span>
      </button>

      {open && (
        <div id={bodyId} className="border-t border-white/10 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
            <label className="block sm:col-span-2">
              {fieldLabel("Strength designation")}
              <input
                value={size.label}
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder="e.g. 10mg"
                aria-label="Strength designation"
                aria-invalid={duplicate || undefined}
                aria-describedby={duplicate ? `${bodyId}-dup` : undefined}
                className={`input-field mt-1 ${duplicate ? "border-red-400" : ""}`}
              />
              {duplicate && (
                <span id={`${bodyId}-dup`} role="alert" className="mt-1 block text-[11px] text-red-300" data-duplicate-warning>
                  This product already has a {size.label.trim()} strength. Each strength must be different.
                </span>
              )}
            </label>
            <div className="block sm:col-span-2">
              {fieldLabel("SKU code")}
              <p className="input-field mt-1 font-mono text-xs text-white/70" data-strength-sku>
                {size.sku ?? "Assigned automatically when saved"}
              </p>
            </div>
            <div className="block sm:col-span-2">
              {fieldLabel("Permanent ID")}
              <p className="input-field mt-1 truncate font-mono text-[10px] text-white/50" title={size.id} data-strength-id>
                {size.id ?? "Assigned when saved"}
              </p>
            </div>

            <label className="block sm:col-span-2">
              {fieldLabel("Retail price (USD)")}
              <input
                type="number"
                step="0.01"
                min="0"
                value={size.priceUsd}
                onChange={(e) => onChange({ priceUsd: e.target.value })}
                placeholder="Blank = not for sale"
                aria-label="Retail price"
                className="input-field mt-1"
              />
            </label>
            <label className="block sm:col-span-2">
              {fieldLabel("Cost of goods (USD)")}
              <input
                type="number"
                step="0.01"
                min="0"
                value={size.costUsd}
                onChange={(e) => onChange({ costUsd: e.target.value })}
                placeholder="Blank = product cost"
                aria-label="Cost of goods"
                className="input-field mt-1"
              />
            </label>
            {/* Stage 2: read-only. Stock changes only through a recorded adjustment in Executive Office → Stock. */}
            <div className="block sm:col-span-2">
              {fieldLabel("Stock (available)")}
              <p className="input-field mt-1 text-xs text-white/70" data-strength-stock>
                {size.stock
                  ? `${size.stock.available} available${size.stock.reserved ? ` (${size.stock.physical} physical, ${size.stock.reserved} reserved)` : ""} · low at ${size.stock.threshold}`
                  : size.id ? "No stock record" : "Opens at 0 when saved"}
              </p>
              <p className="mt-1 text-[10px] text-white/35">Adjust in the Stock tab.</p>
            </div>
            <label className="block sm:col-span-6">
              {fieldLabel("Bulk pricing (minQty:price, e.g. 3:38, 5:32)")}
              <input
                value={size.bulkTiers}
                onChange={(e) => onChange({ bulkTiers: e.target.value })}
                placeholder="e.g. 3:38, 5:32"
                aria-label="Bulk pricing"
                className="input-field mt-1"
              />
            </label>

            {/* What customers are told about this strength and whether it can be bought. Only In Stock can be, and
                only while ordering is switched on sitewide. */}
            <label className="block sm:col-span-2">
              {fieldLabel("Availability status")}
              <select
                value={size.availabilityStatus}
                onChange={(e) => onChange({ availabilityStatus: e.target.value as AvailabilityStatus })}
                aria-label="Availability status"
                className="input-field mt-1"
              >
                {AVAILABILITY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {AVAILABILITY_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            {/* Optional, informational only: shown under Coming Soon / Pending Independent Testing until the date
                passes (US Central). Never changes the status or what can be bought. */}
            <div className="block sm:col-span-4">
              {fieldLabel("Estimated availability date (optional)")}
              <div className="mt-1 flex gap-2">
                <input
                  type="date"
                  value={size.estimatedAvailableOn}
                  onChange={(e) => onChange({ estimatedAvailableOn: e.target.value })}
                  aria-label="Estimated availability date"
                  className="input-field flex-1"
                />
                <button
                  type="button"
                  onClick={() => onChange({ estimatedAvailableOn: "" })}
                  disabled={!size.estimatedAvailableOn}
                  className="border border-white/20 px-3 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold disabled:opacity-30"
                >
                  Clear
                </button>
              </div>
              <p className="mt-1 text-[11px] text-white/40">
                Shown for Coming Soon and Pending Independent Testing only, through the end of that day (US Central).
              </p>
            </div>

            <label className="input-field flex items-center gap-3 sm:col-span-6">
              <input
                type="checkbox"
                checked={size.active}
                onChange={(e) => onChange({ active: e.target.checked })}
                aria-label="Active"
                className="h-4 w-4 accent-gold"
              />
              <span className="text-sm text-white/70">
                {size.active
                  ? "Active — offered to customers"
                  : "Deactivated — hidden from customers; its SKU, orders and certificates are kept"}
              </span>
            </label>
          </div>

          {renamed && (
            <p className="mt-3 border border-[var(--x-border-strong)] p-3 text-[11px] leading-relaxed text-white/60" data-rename-warning>
              Renaming &ldquo;{size.savedLabel}&rdquo; to &ldquo;{size.label.trim()}&rdquo; keeps this strength&apos;s SKU code and
              permanent ID, and moves its stock count. Past orders and certificate records keep the name they were made
              with, so a certificate filed under &ldquo;{size.savedLabel}&rdquo; will no longer match this strength.
            </p>
          )}

          <div className="mt-4">
            {fieldLabel("Primary vial image")}
            {product && saved?.id ? (
              <StrengthImageControl product={product} strength={saved} onChange={onImageChange} />
            ) : (
              <p className="mt-1 text-[11px] text-white/40">Save the product first, then upload this strength&apos;s vial image.</p>
            )}
          </div>

          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="mt-4 border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50 hover:text-white"
            >
              Remove this unsaved strength
            </button>
          )}
        </div>
      )}
    </div>
  );
}
