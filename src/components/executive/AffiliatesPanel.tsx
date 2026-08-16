"use client";

import { useCallback, useEffect, useState } from "react";
import type { AffiliateSummary, CommissionType } from "@/lib/types";
import type { CommissionStructureContent } from "@/lib/site-content";

type FormState = {
  name: string;
  email: string;
  phone: string;
  paymentMethod: string;
  notes: string;
  commissionType: CommissionType;
  commissionRate: string;
  commissionFlatAmount: string;
  code: string;
  customerDiscountPercent: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    email: "",
    phone: "",
    paymentMethod: "",
    notes: "",
    commissionType: "percent",
    commissionRate: "10",
    commissionFlatAmount: "0",
    code: "",
    customerDiscountPercent: "0",
  };
}

// Shared tab (both realms) — /office gets a read-only view (no create,
// payout, activate/deactivate, delete, or portal-code regeneration).
export function AffiliatesPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [affiliates, setAffiliates] = useState<AffiliateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [payoutFor, setPayoutFor] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteSentId, setInviteSentId] = useState<string | null>(null);

  const [structure, setStructure] = useState<CommissionStructureContent | null>(null);
  const [structureSaving, setStructureSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [affRes, contentRes] = await Promise.all([
      fetch("/api/executive/affiliates", { cache: "no-store" }),
      fetch("/api/executive/content", { cache: "no-store" }),
    ]);
    if (affRes.ok) setAffiliates((await affRes.json()).affiliates ?? []);
    if (contentRes.ok) {
      const data = await contentRes.json();
      setStructure(data.commissionStructure ?? { paragraphs: [] });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/executive/affiliates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          paymentMethod: form.paymentMethod || undefined,
          notes: form.notes || undefined,
          commissionType: form.commissionType,
          commissionRate: Number(form.commissionRate) || 0,
          commissionFlatAmount: Number(form.commissionFlatAmount) || 0,
          code: form.code,
          customerDiscountPercent: Number(form.customerDiscountPercent) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create affiliate.");
      setForm(emptyForm());
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create affiliate.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(a: AffiliateSummary) {
    await fetch(`/api/executive/affiliates/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !a.active }),
    });
    await load();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this affiliate? Their promo code will also be removed.")) return;
    await fetch(`/api/executive/affiliates/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleRecordPayout(id: string) {
    const amount = Number(payoutAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    await fetch(`/api/executive/affiliates/${id}/payouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, paidAt: new Date().toISOString(), note: payoutNote || undefined }),
    });
    setPayoutFor(null);
    setPayoutAmount("");
    setPayoutNote("");
    await load();
  }

  async function handleRegenerateCode(id: string) {
    setRegeneratingId(id);
    try {
      await fetch(`/api/executive/affiliates/${id}/regenerate-code`, { method: "POST" });
      await load();
    } finally {
      setRegeneratingId(null);
    }
  }

  async function handleSendInvite(id: string) {
    setInvitingId(id);
    setInviteSentId(null);
    try {
      await fetch(`/api/executive/affiliates/${id}/send-invite`, { method: "POST" });
      setInviteSentId(id);
    } finally {
      setInvitingId(null);
    }
  }

  async function handleSaveStructure() {
    if (!structure) return;
    setStructureSaving(true);
    try {
      await fetch("/api/executive/content", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "commission_structure", value: structure }),
      });
    } finally {
      setStructureSaving(false);
    }
  }

  const cardClass = isCommand ? "command-panel p-6" : "office-card";

  return (
    <div className="space-y-6">
      {structure && isCommand && (
        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Commission Structure</p>
          <textarea
            value={structure.paragraphs.join("\n\n")}
            onChange={(e) =>
              setStructure({ paragraphs: e.target.value.split("\n\n").filter((p) => p.trim()) })
            }
            rows={4}
            placeholder="Separate paragraphs with a blank line"
            className="input-field mt-3"
          />
          <button
            type="button"
            onClick={handleSaveStructure}
            disabled={structureSaving}
            className="mt-3 border border-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
          >
            {structureSaving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
      {structure && !isCommand && structure.paragraphs.length > 0 && (
        <div className="office-card">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Commission Structure</p>
          {structure.paragraphs.map((p, i) => (
            <p key={i} className="mt-3 text-sm text-white/70">{p}</p>
          ))}
        </div>
      )}

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Affiliates — Leaderboard by Revenue</p>
          <div className="flex gap-2">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page route */}
            <a
              href="/api/executive/affiliates?format=csv"
              className="border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.15em] text-white/70 transition-colors hover:border-gold hover:text-gold"
            >
              Export CSV
            </a>
            {isCommand && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="border border-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black"
              >
                + New Affiliate
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>
        )}

        <div className="mt-6 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-white/30">Loading...</p>
          ) : affiliates.length === 0 ? (
            <p className="text-sm text-white/30">No affiliates yet.</p>
          ) : (
            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
                  <th className="pb-3 pr-4 font-normal">Affiliate</th>
                  <th className="pb-3 pr-4 font-normal">Code</th>
                  <th className="pb-3 pr-4 font-normal">Portal Code</th>
                  <th className="pb-3 pr-4 font-normal">Orders</th>
                  <th className="pb-3 pr-4 font-normal">Gross Revenue</th>
                  <th className="pb-3 pr-4 font-normal">Commission Earned</th>
                  <th className="pb-3 pr-4 font-normal">Paid</th>
                  <th className="pb-3 pr-4 font-normal">Balance Owed</th>
                  <th className="pb-3 pr-4 font-normal">YTD Revenue</th>
                  {isCommand && <th className="pb-3 font-normal">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {affiliates.map((a) => (
                  <tr key={a.id} className="border-b border-white/5 align-top text-white/80">
                    <td className="py-3 pr-4">
                      <p className="text-white">{a.name}</p>
                      <p className="text-xs text-white/40">{a.email}</p>
                      {!a.active && <p className="text-xs text-red-300">Inactive</p>}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">{a.code ?? "—"}</td>
                    <td className="py-3 pr-4">
                      <p className="font-mono text-xs text-gold">{a.portalCode ?? "—"}</p>
                      {isCommand && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleRegenerateCode(a.id)}
                            disabled={regeneratingId === a.id}
                            className="text-[10px] uppercase tracking-[0.1em] text-white/40 hover:text-gold disabled:opacity-40"
                          >
                            {regeneratingId === a.id ? "Regenerating..." : "Regenerate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendInvite(a.id)}
                            disabled={invitingId === a.id}
                            className="text-[10px] uppercase tracking-[0.1em] text-white/40 hover:text-gold disabled:opacity-40"
                          >
                            {invitingId === a.id ? "Sending..." : inviteSentId === a.id ? "Sent!" : "Resend Invite"}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4">{a.ordersDriven}</td>
                    <td className="py-3 pr-4">${a.grossRevenue.toFixed(2)}</td>
                    <td className="py-3 pr-4">${a.commissionEarned.toFixed(2)}</td>
                    <td className="py-3 pr-4">${a.commissionPaid.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-gold">${a.balanceOwed.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-xs text-white/50">
                      ${a.ytdRevenue.toFixed(2)} / ${a.ytdCommission.toFixed(2)} comm.
                    </td>
                    {isCommand && (
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setPayoutFor(a.id)}
                          className="border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold"
                        >
                          Record Payout
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(a)}
                          className="border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-gold hover:text-gold"
                        >
                          {a.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(a.id)}
                          className="border border-red-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:border-red-400"
                        >
                          Delete
                        </button>
                      </div>
                      {payoutFor === a.id && (
                        <div className="mt-2 space-y-2 border border-white/15 bg-black p-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={payoutAmount}
                            onChange={(e) => setPayoutAmount(e.target.value)}
                            placeholder={`Amount (balance: $${a.balanceOwed.toFixed(2)})`}
                            className="w-full border border-white/15 bg-black px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-gold focus:outline-none"
                          />
                          <input
                            value={payoutNote}
                            onChange={(e) => setPayoutNote(e.target.value)}
                            placeholder="Note (optional)"
                            className="w-full border border-white/15 bg-black px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-gold focus:outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleRecordPayout(a.id)}
                              className="border border-gold px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-gold hover:bg-gold hover:text-black"
                            >
                              Confirm Paid
                            </button>
                            <button
                              type="button"
                              onClick={() => setPayoutFor(null)}
                              className="border border-white/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {creating && isCommand && (
        <form onSubmit={handleCreate} className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">New Affiliate</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" className="input-field" />
            <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className="input-field" />
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone (optional)" className="input-field" />
            <input value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} placeholder="Payment method (e.g. PayPal, wire)" className="input-field" />
            <input
              required
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="Promo code (e.g. JANE15)"
              className="input-field"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={form.customerDiscountPercent}
              onChange={(e) => setForm((f) => ({ ...f, customerDiscountPercent: e.target.value }))}
              placeholder="Customer discount % (0 = tracking-only code)"
              className="input-field"
            />
            <select
              value={form.commissionType}
              onChange={(e) => setForm((f) => ({ ...f, commissionType: e.target.value as CommissionType }))}
              className="input-field"
            >
              <option value="percent">Commission: % of sale</option>
              <option value="flat">Commission: flat per order</option>
            </select>
            {form.commissionType === "percent" ? (
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.commissionRate}
                onChange={(e) => setForm((f) => ({ ...f, commissionRate: e.target.value }))}
                placeholder="Commission rate %"
                className="input-field"
              />
            ) : (
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.commissionFlatAmount}
                onChange={(e) => setForm((f) => ({ ...f, commissionFlatAmount: e.target.value }))}
                placeholder="Flat commission per order (USD)"
                className="input-field"
              />
            )}
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Notes (optional)"
              rows={2}
              className="input-field sm:col-span-2"
            />
          </div>
          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save Affiliate"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="border border-white/15 px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-white/50 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
