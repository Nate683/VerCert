"use client";

import { useState } from "react";

export function MarketingToggle({ initialOptIn }: { initialOptIn: boolean }) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [saving, setSaving] = useState(false);

  async function handleChange(checked: boolean) {
    setOptIn(checked);
    setSaving(true);
    try {
      await fetch("/api/account/marketing-opt-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketingOptIn: checked }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex items-center gap-3 text-sm text-white/70">
      <input
        type="checkbox"
        checked={optIn}
        disabled={saving}
        onChange={(e) => handleChange(e.target.checked)}
        className="h-4 w-4 accent-[#c9a227]"
      />
      Send me occasional updates about new compounds and testing results.
    </label>
  );
}
