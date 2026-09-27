"use client";

import { useState } from "react";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function MarketingToggle({
  initialConsent,
  initialConsentAt,
}: {
  initialConsent: boolean;
  initialConsentAt?: string;
}) {
  const [consent, setConsent] = useState(initialConsent);
  const [consentAt, setConsentAt] = useState(initialConsentAt);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function handleChange(checked: boolean) {
    setConsent(checked);
    setSaving(true);
    setError(false);
    try {
      const res = await fetch("/api/account/marketing-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketingConsent: checked }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setConsent(data.marketingConsent);
      setConsentAt(data.marketingConsentAt ?? undefined);
    } catch {
      setConsent(!checked);
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label htmlFor="account-marketing" className="flex items-start gap-3 text-sm text-muted">
        <input
          id="account-marketing"
          type="checkbox"
          checked={consent}
          disabled={saving}
          onChange={(e) => handleChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-gold"
        />
        Send me product updates, restock notices, and offers. You can unsubscribe anytime.
      </label>
      <p className="mt-2 pl-7 text-xs text-muted">
        {error
          ? "Couldn't save your preference. Please try again."
          : consentAt
            ? `Last changed ${formatDate(consentAt)}.`
            : null}{" "}
        Order, shipping and account-security emails are always sent.
      </p>
    </div>
  );
}
