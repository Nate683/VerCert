"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActivityLogEntry } from "@/lib/types";
import type { NotificationSettings } from "@/lib/site-content";

export function AdminPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const requests: Promise<Response>[] = [fetch("/api/executive/notifications", { cache: "no-store" })];
    if (isCommand) requests.push(fetch("/api/executive/activity", { cache: "no-store" }));
    const [settingsRes, activityRes] = await Promise.all(requests);
    if (settingsRes.ok) setSettings((await settingsRes.json()).settings);
    if (activityRes?.ok) setEntries((await activityRes.json()).entries ?? []);
    setLoading(false);
  }, [isCommand]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/executive/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const cardClass = isCommand ? "command-panel p-6" : "office-card";

  if (loading || !settings) {
    return <p className="text-sm text-white/30">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Notification Settings</p>
        <div className="mt-4 grid grid-cols-1 gap-3">
          <input
            type="email"
            value={settings.emailAddress}
            onChange={(e) => setSettings({ ...settings, emailAddress: e.target.value })}
            placeholder="Notification email address"
            className="input-field"
          />
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.notifyNewOrder}
              onChange={(e) => setSettings({ ...settings, notifyNewOrder: e.target.checked })}
              className="h-4 w-4 accent-[#c9a227]"
            />
            <span className="text-sm text-white/70">Email me when a new order is placed</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.notifyLowStock}
              onChange={(e) => setSettings({ ...settings, notifyLowStock: e.target.checked })}
              className="h-4 w-4 accent-[#c9a227]"
            />
            <span className="text-sm text-white/70">Email me when a product hits its low-stock threshold</span>
          </label>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="mt-4 border border-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && <span className="ml-3 text-xs text-gold">Saved.</span>}
      </div>

      {isCommand && (
        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Activity Log</p>
          <p className="mt-1 text-[10px] text-white/30">Visible on /command only.</p>
          {entries.length === 0 ? (
            <p className="mt-4 text-sm text-white/40">No activity recorded yet.</p>
          ) : (
            <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1 text-sm">
              {entries.map((entry) => (
                <li key={entry.id} className="border-l border-gold/30 pl-3">
                  <p className="text-white/80">
                    <span className="text-gold">{entry.actorEmail}</span> — {entry.action}
                    {entry.details ? ` (${entry.details})` : ""}
                  </p>
                  <p className="font-mono text-[10px] text-white/30">
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
