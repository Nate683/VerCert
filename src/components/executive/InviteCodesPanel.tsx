"use client";

import { useCallback, useEffect, useState } from "react";
import type { AffiliateInviteCode, AffiliateTier } from "@/lib/types";

const TIER_OPTIONS: { id: AffiliateTier; label: string }[] = [
  { id: "standard", label: "Standard (8%)" },
  { id: "associate", label: "Associate (10%)" },
  { id: "principal", label: "Principal (14%)" },
  { id: "managing_principal", label: "Managing Principal (18%)" },
  { id: "partner", label: "Partner (30%)" },
];

export function InviteCodesPanel() {
  const [codes, setCodes] = useState<AffiliateInviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [code, setCode] = useState("");
  const [boundEmail, setBoundEmail] = useState("");
  const [tier, setTier] = useState<AffiliateTier>("standard");
  const [customerDiscountPercent, setCustomerDiscountPercent] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/executive/invite-codes", { cache: "no-store" });
    if (res.ok) setCodes((await res.json()).codes ?? []);
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
      const res = await fetch("/api/executive/invite-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          boundEmail: boundEmail || undefined,
          tier,
          customerDiscountPercent: Number(customerDiscountPercent) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create invite code.");
      setCode("");
      setBoundEmail("");
      setTier("standard");
      setCustomerDiscountPercent("0");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invite code.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!window.confirm("Revoke this unused invite code?")) return;
    await fetch(`/api/executive/invite-codes/${id}`, { method: "DELETE" });
    await load();
  }

  const [resendingId, setResendingId] = useState<string | null>(null);

  async function handleResend(id: string) {
    setResendingId(id);
    try {
      await fetch(`/api/executive/invite-codes/${id}/resend`, { method: "POST" });
    } finally {
      setResendingId(null);
    }
  }

  const cardClass = "command-panel p-6";

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">New Invite Code</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <input
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Code (e.g. SARAH20)"
            className="input-field"
          />
          <input
            type="email"
            value={boundEmail}
            onChange={(e) => setBoundEmail(e.target.value)}
            placeholder="Bind to email (optional)"
            className="input-field"
          />
          <select value={tier} onChange={(e) => setTier(e.target.value as AffiliateTier)} className="input-field">
            {TIER_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={customerDiscountPercent}
            onChange={(e) => setCustomerDiscountPercent(e.target.value)}
            placeholder="Customer discount %"
            className="input-field"
          />
        </div>
        {error && (
          <p className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>
        )}
        <button
          type="submit"
          disabled={saving || !code.trim()}
          className="mt-4 border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
        >
          {saving ? "Creating..." : "Create Code"}
        </button>
      </form>

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">
          Invite Codes ({codes.length})
        </p>
        <div className="mt-6 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-white/30">Loading...</p>
          ) : codes.length === 0 ? (
            <p className="text-sm text-white/30">No invite codes yet.</p>
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
                  <th className="pb-3 pr-4 font-normal">Code</th>
                  <th className="pb-3 pr-4 font-normal">Bound Email</th>
                  <th className="pb-3 pr-4 font-normal">Tier</th>
                  <th className="pb-3 pr-4 font-normal">Status</th>
                  <th className="pb-3 pr-4 font-normal">Used At</th>
                  <th className="pb-3 font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 align-top text-white/80">
                    <td className="py-3 pr-4 font-mono text-xs text-gold">{c.code}</td>
                    <td className="py-3 pr-4 text-xs">{c.boundEmail ?? "Any email"}</td>
                    <td className="py-3 pr-4 text-xs">
                      {TIER_OPTIONS.find((t) => t.id === c.tier)?.label ?? c.tier}
                    </td>
                    <td className="py-3 pr-4 text-xs">{c.usedAt ? "Used" : "Unused"}</td>
                    <td className="py-3 pr-4 text-xs text-white/50">
                      {c.usedAt ? new Date(c.usedAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-3">
                      {!c.usedAt && (
                        <div className="flex flex-wrap gap-2">
                          {c.boundEmail && (
                            <button
                              type="button"
                              onClick={() => handleResend(c.id)}
                              disabled={resendingId === c.id}
                              className="border border-gold/30 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-gold/80 hover:border-gold disabled:opacity-40"
                            >
                              {resendingId === c.id ? "Sending..." : "Resend"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRevoke(c.id)}
                            className="border border-red-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:border-red-400"
                          >
                            Revoke
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
