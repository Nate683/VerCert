"use client";

import { useState } from "react";

type Prefs = { notifyStock: boolean; notifyCoa: boolean };

// The three notification emails in the Client Dashboard Policy. Order and
// shipping notifications are transactional, so that one is shown on and
// locked; the other two save as soon as they change.
export function NotificationPreferences({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);
  const [error, setError] = useState(false);

  async function handleChange(key: keyof Prefs, checked: boolean) {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: checked });
    setSaving(key);
    setError(false);
    try {
      const res = await fetch("/api/account/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: checked }),
      });
      if (!res.ok) throw new Error();
      setPrefs(await res.json());
    } catch {
      setPrefs(previous);
      setError(true);
    } finally {
      setSaving(null);
    }
  }

  return (
    <fieldset className="space-y-4">
      <legend className="sr-only">Notification emails</legend>
      <div>
        <label htmlFor="notify-order" className="flex items-start gap-3 text-sm text-muted">
          <input id="notify-order" type="checkbox" checked disabled className="mt-0.5 h-4 w-4 accent-gold" />
          Order and shipping notifications
        </label>
        <p className="mt-1 pl-7 text-xs text-muted">
          Always on: these confirm your order, payment and shipment, so they can&apos;t be switched off.
        </p>
      </div>
      <label htmlFor="notify-stock" className="flex items-start gap-3 text-sm text-muted">
        <input
          id="notify-stock"
          type="checkbox"
          checked={prefs.notifyStock}
          disabled={saving !== null}
          onChange={(e) => handleChange("notifyStock", e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-gold"
        />
        Stock and availability updates
      </label>
      <label htmlFor="notify-coa" className="flex items-start gap-3 text-sm text-muted">
        <input
          id="notify-coa"
          type="checkbox"
          checked={prefs.notifyCoa}
          disabled={saving !== null}
          onChange={(e) => handleChange("notifyCoa", e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-gold"
        />
        Certificate of analysis postings
      </label>
      {error && <p className="text-xs text-red-700">Couldn&apos;t save your preference. Please try again.</p>}
    </fieldset>
  );
}
